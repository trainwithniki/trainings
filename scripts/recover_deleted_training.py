import os
import re
import sys
import uuid
from pathlib import Path

import psycopg
from psycopg import sql


TARGET_TITLE = "Пилатес"
TARGET_DATE = "2026-09-07"
TARGET_TIME = "18:30"


def decode_copy_value(value: str):
    if value == r"\N":
        return None

    def replace(match: re.Match[str]) -> str:
        escaped = match.group(1)
        simple = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}
        if escaped in simple:
            return simple[escaped]
        if escaped.startswith("x"):
            return chr(int(escaped[1:], 16))
        if escaped.isdigit():
            return chr(int(escaped, 8))
        return escaped

    return re.sub(r"\\(x[0-9A-Fa-f]{2}|[0-7]{1,3}|.)", replace, value)


def read_copy_table(path: Path, table: str):
    header = re.compile(r"^COPY\s+(.+?)\s*\((.+)\)\s+FROM\s+stdin;$", re.IGNORECASE)
    rows = []
    columns = None
    with path.open("r", encoding="utf-8") as dump:
        for raw_line in dump:
            line = raw_line.rstrip("\n")
            if columns is None:
                match = header.match(line)
                if match:
                    relation = match.group(1).replace('"', "").split(".")[-1].strip()
                    if relation.lower() == table.lower():
                        columns = [column.strip().strip('"') for column in match.group(2).split(",")]
                continue
            if line == r"\.":
                break
            values = [decode_copy_value(value) for value in line.split("\t")]
            if len(values) != len(columns):
                raise RuntimeError(f"Unexpected COPY row width for {table}")
            rows.append(dict(zip(columns, values)))
    if columns is None:
        raise RuntimeError(f"Table {table} was not found in the backup")
    return rows


def old_value(details, field):
    return ((details or {}).get("changes", {}).get(field, {}) or {}).get("from")


def normalized_phone(value):
    return re.sub(r"\D", "", value or "")


def insert_row(cursor, table, row, columns):
    present = [column for column in columns if column in row and row[column] is not None]
    query = sql.SQL("insert into public.{} ({}) values ({})").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, present)),
        sql.SQL(", ").join(sql.Placeholder() for _ in present),
    )
    cursor.execute(query, [row[column] for column in present])


def main():
    if len(sys.argv) != 2:
        raise RuntimeError("Expected the decrypted data.sql path")
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL is missing")

    dump_path = Path(sys.argv[1])
    backup_sessions = read_copy_table(dump_path, "training_sessions")
    backup_registrations = read_copy_table(dump_path, "training_registrations")

    with psycopg.connect(db_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select entity_id, created_at, details
                from public.audit_logs
                where action = 'DELETE'
                  and entity_type = 'training_sessions'
                  and details->>'date' = %s
                  and details->>'time' = %s
                  and lower(details->'changes'->'title'->>'from') = lower(%s)
                order by created_at desc
                """,
                (TARGET_DATE, TARGET_TIME, TARGET_TITLE),
            )
            deleted_sessions = cursor.fetchall()
            if not deleted_sessions:
                raise RuntimeError("The deleted training was not found in History")

            selected = None
            for entity_id, deleted_at, details in deleted_sessions:
                cursor.execute(
                    """
                    select count(*)
                    from public.audit_logs
                    where action = 'DELETE'
                      and entity_type = 'training_registrations'
                      and created_at = %s
                    """,
                    (deleted_at,),
                )
                deleted_count = cursor.fetchone()[0]
                if selected is None or deleted_count > selected[3]:
                    selected = (entity_id, deleted_at, details, deleted_count)

            session_id, deleted_at, details, deleted_count = selected
            if deleted_count == 0:
                raise RuntimeError("No participant deletion records matched the training")

            cursor.execute(
                "select count(*) from public.training_sessions where id = %s or (date = %s and start_time = %s and lower(title) = lower(%s))",
                (session_id, TARGET_DATE, TARGET_TIME, TARGET_TITLE),
            )
            if cursor.fetchone()[0]:
                raise RuntimeError("A matching live training already exists; recovery stopped to avoid a duplicate")

            backup_session = next((row for row in backup_sessions if row.get("id") == session_id), None)
            if backup_session is None:
                raise RuntimeError("The exact deleted training was not found in the pre-deletion backup")

            restored_session = dict(backup_session)
            for field in (
                "title", "date", "start_time", "location", "duration", "capacity",
                "standard_capacity", "multisport_capacity", "booking_open_hours", "status",
            ):
                value = old_value(details, field)
                if value is not None:
                    restored_session[field] = value

            insert_row(
                cursor,
                "training_sessions",
                restored_session,
                (
                    "id", "date", "start_time", "title", "location", "duration", "capacity",
                    "standard_capacity", "multisport_capacity", "booking_open_hours", "status",
                    "created_at", "updated_at",
                ),
            )

            cursor.execute(
                """
                select entity_id
                from public.audit_logs
                where action = 'DELETE'
                  and entity_type = 'training_registrations'
                  and created_at < %s
                """,
                (deleted_at,),
            )
            deleted_before_session = {row[0] for row in cursor.fetchall()}
            backed_up = [
                row for row in backup_registrations
                if row.get("session_id") == session_id
                and row.get("id") not in deleted_before_session
            ]
            registration_columns = (
                "id", "session_id", "name", "phone", "tariff", "booked_by",
                "cancellation_token", "cancelled_at", "created_at",
            )
            for row in backed_up:
                insert_row(cursor, "training_registrations", row, registration_columns)

            restored_phones = {
                normalized_phone(row.get("phone"))
                for row in backed_up
                if row.get("cancelled_at") is None
            }
            cursor.execute(
                """
                select entity_id, details
                from public.audit_logs
                where action = 'DELETE'
                  and entity_type = 'training_registrations'
                  and created_at = %s
                order by id
                """,
                (deleted_at,),
            )
            missing_count = 0
            for registration_id, registration_details in cursor.fetchall():
                phone = old_value(registration_details, "phone")
                if normalized_phone(phone) in restored_phones:
                    continue
                row = {
                    "id": registration_id,
                    "session_id": session_id,
                    "name": old_value(registration_details, "name"),
                    "phone": phone,
                    "tariff": old_value(registration_details, "tariff") or "none",
                    "booked_by": old_value(registration_details, "booked_by"),
                    "cancellation_token": str(uuid.uuid4()),
                    "created_at": deleted_at,
                }
                insert_row(cursor, "training_registrations", row, registration_columns)
                restored_phones.add(normalized_phone(phone))
                missing_count += 1

            cursor.execute(
                "select registration_count from public.training_sessions where id = %s",
                (session_id,),
            )
            final_count = cursor.fetchone()[0]
            if final_count != deleted_count:
                raise RuntimeError(
                    f"Recovery count mismatch: expected {deleted_count}, restored {final_count}"
                )
            print(
                f"Recovered one training with {final_count} active registrations; "
                f"{missing_count} were added from History because they were newer than the backup."
            )


if __name__ == "__main__":
    main()
