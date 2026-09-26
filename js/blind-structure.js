export const MIN = 60 * 1000;
export const BREAK_DURATION = 5 * MIN;

export const BLIND_LEVELS = [
  { sb: 100, bb: 200, label: "100 / 200", dur: 15 * MIN },
  { sb: 200, bb: 400, label: "200 / 400", dur: 15 * MIN },
  { sb: 300, bb: 600, label: "300 / 600", dur: 15 * MIN },
  { sb: 400, bb: 800, label: "400 / 800", dur: 15 * MIN },
  { sb: 500, bb: 1000, label: "500 / 1,000", dur: 15 * MIN },
  { isBreak: true, label: "BREAK", dur: 5 * MIN },
  { sb: 1000, bb: 2000, label: "1,000 / 2,000", dur: 10 * MIN },
  { sb: 2000, bb: 4000, label: "2,000 / 4,000", dur: 10 * MIN },
  { sb: 3000, bb: 6000, label: "3,000 / 6,000", dur: 10 * MIN },
  { sb: 4000, bb: 8000, label: "4,000 / 8,000", dur: 10 * MIN },
  { sb: 5000, bb: 10000, label: "5,000 / 10,000", dur: 10 * MIN },
  { isBreak: true, label: "BREAK", dur: 5 * MIN },
  { sb: 10000, bb: 20000, label: "10,000 / 20,000", dur: 5 * MIN },
  { sb: 20000, bb: 40000, label: "20,000 / 40,000", dur: 5 * MIN },
  { sb: 30000, bb: 60000, label: "30,000 / 60,000", dur: 5 * MIN },
  { sb: 40000, bb: 80000, label: "40,000 / 80,000", dur: 5 * MIN },
  { sb: 50000, bb: 100000, label: "50,000 / 100,000", dur: 5 * MIN },
];
