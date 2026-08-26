export type TrainingPage = {
  slug: string;
  title: string;
  icon: string;
  keywords: string[];
  description: string;
  externalUrl?: string;
};

export const trainingPages: TrainingPage[] = [
  {slug:'pilates',title:'Пилатес',icon:'pilates.webp',keywords:['пилатес','pilates'],description:'Контролирано движение, стабилност и повече лекота във всяко движение.'},
  {slug:'body-balance',title:'Body Balance',icon:'body-balance.webp',keywords:['body balance','баланс'],description:'Хармонична тренировка за баланс, мобилност и спокойна сила.'},
  {slug:'body-training',title:'Body Training',icon:'body-training.webp',keywords:['body training'],description:'Цялостна тренировка за сила, тонус и увереност.'},
  {slug:'zumba',title:'Зумба',icon:'zumba.webp',keywords:['зумба','zumba'],description:'Динамично движение, музика и много положителна енергия.'},
  {slug:'kids-conditioning',title:'Детска кондиционна',icon:'kids-conditioning.webp',keywords:['детска','кондиционен тим'],description:'Забавна и полезна тренировка за активни и уверени деца.'},
  {slug:'strong-body',title:'Strong Body',icon:'strong-body.webp',keywords:['strong body','strong'],description:'Интензивна тренировка за сила, издръжливост и стегнато тяло.'},
  {slug:'tae-bo',title:'Tae Bo',icon:'tae-bo.webp',keywords:['tae bo','тае бо','tae','тае'],description:'Енергична комбинация от бойни движения и кардио натоварване.'},
  {slug:'step-aerobics',title:'Степ аеробика',icon:'step-aerobics.webp',keywords:['step','степ'],description:'Ритмична кардио тренировка със степ платформа и много настроение.',externalUrl:'https://trainwithniki.github.io/NikiStep/'},
];

export function trainingPageForTitle(title:string){
  const value=title.toLocaleLowerCase('bg');
  return trainingPages.find(page=>page.keywords.some(keyword=>value.includes(keyword)));
}

export function trainingIconForTitle(title:string){
  return trainingPageForTitle(title)?.icon??'body-training.webp';
}

export function trainingPageFromPath(pathname:string){
  const slug=pathname.split('/').pop()?.replace(/\.html$/,'')??'';
  return trainingPages.find(page=>page.slug===slug);
}
