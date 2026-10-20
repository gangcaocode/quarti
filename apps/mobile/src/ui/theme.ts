// Colors from the prototype (docs/prototype.html). Light only for the pilot.
export const C = {
  br: '#0F6E56', brl: '#E1F5EE', brd: '#085041',     // brand green
  am: '#BA7517', aml: '#FAEEDA', amd: '#633806',     // waiting / amber
  co: '#D85A30', col: '#FAECE7', cod: '#712B13',     // coral: open, needs you
  bl: '#185FA5', bll: '#E6F1FB', bld: '#0C447C',     // blue: info
  rd: '#A32D2D', rdl: '#FCEBEB', rdd: '#791F1F',     // red: danger
  pu: '#534AB7', pul: '#EEEDFE', pud: '#26215C',     // purple: Pro
  s0: '#F1EFE8', s1: '#F8F7F3', s2: '#FFFFFF',       // surfaces
  t1: '#1A1A18', t2: '#5F5E5A', t3: '#9C9A92',       // text
  b: '#E4E2DA', bs: '#D3D1C7',                       // borders
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const R = { sm: 8, md: 10, lg: 14 } as const;
