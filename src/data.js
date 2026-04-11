// ====================================================================
// MLB-CALIBRATED OUTCOME DATA (2024 season averages per PA)
// Source: FanGraphs / Baseball Reference 2024
// ====================================================================
export const MLB = { k:.226, go:.203, fo:.165, lo:.056, walk:.081, hbp:.018, single:.149, double:.051, triple:.004, hr:.030 };

export const B_ARCHS = [
  {l:'Power',    avgD:-.020,kD:+.06,bbD:+.01,hrD:+.015,goD:-.02,trD:0},
  {l:'Contact',  avgD:+.025,kD:-.06,bbD:-.01,hrD:-.010,goD:+.02,trD:0},
  {l:'Patient',  avgD:+.005,kD:-.03,bbD:+.04,hrD:+.005,goD:-.01,trD:0},
  {l:'Speedster',avgD:+.010,kD:-.02,bbD:+.00,hrD:-.015,goD:-.01,trD:.006},
  {l:'Balanced', avgD:0,    kD:0,   bbD:0,   hrD:0,    goD:0,   trD:0},
];

export const P_ARCHS = [
  {l:'Strikeout',eraD:-.30,kD:+.06,bbD:+.01,goD:0},
  {l:'Groundball',eraD:-.15,kD:-.02,bbD:-.01,goD:.04},
  {l:'Control',  eraD:-.20,kD:+.01,bbD:-.03,goD:0},
  {l:'Veteran',  eraD:0,   kD:0,   bbD:0,   goD:0},
  {l:'Power Arm',eraD:+.10,kD:+.04,bbD:+.02,goD:0},
];

// ====================================================================
// AVERAGE ROSTER PROFILES — defaults for the editable template team
// LINEUP_PROFILES: one entry per batting order slot (0=leadoff … 8=9th)
// PITCHER_PROFILES: one entry per pitching slot (0=SP/Ace, 1=RP, 2=CL)
// ====================================================================
export const LINEUP_PROFILES = [
  // 0 Leadoff (CF)  — fast, gets on base
  { label:'Leadoff',   avg:.272, kPct:.178, bbPct:.108, hrPct:.010, sbRate:.128, doublePct:.042, triplePct:.008, goPct:.212, foPct:.158 },
  // 1 2nd (SS)       — best contact, low K
  { label:'Contact',   avg:.282, kPct:.162, bbPct:.094, hrPct:.015, sbRate:.072, doublePct:.048, triplePct:.004, goPct:.222, foPct:.162 },
  // 2 3rd (RF)       — power + contact
  { label:'3-Hole',    avg:.274, kPct:.212, bbPct:.092, hrPct:.038, sbRate:.048, doublePct:.058, triplePct:.003, goPct:.185, foPct:.175 },
  // 3 Cleanup (1B)   — best power + contact combined
  { label:'Cleanup',   avg:.278, kPct:.222, bbPct:.102, hrPct:.058, sbRate:.028, doublePct:.062, triplePct:.002, goPct:.175, foPct:.182 },
  // 4 5th (3B)       — power hitter
  { label:'Power',     avg:.256, kPct:.252, bbPct:.088, hrPct:.050, sbRate:.030, doublePct:.056, triplePct:.002, goPct:.178, foPct:.185 },
  // 5 6th (LF)       — balanced, contact lean
  { label:'Balanced+', avg:.264, kPct:.206, bbPct:.083, hrPct:.028, sbRate:.058, doublePct:.050, triplePct:.003, goPct:.202, foPct:.165 },
  // 6 7th (2B)       — balanced
  { label:'Balanced',  avg:.254, kPct:.220, bbPct:.076, hrPct:.022, sbRate:.054, doublePct:.046, triplePct:.003, goPct:.206, foPct:.165 },
  // 7 8th (C)        — below average
  { label:'Reserve',   avg:.238, kPct:.236, bbPct:.066, hrPct:.018, sbRate:.038, doublePct:.042, triplePct:.002, goPct:.212, foPct:.165 },
  // 8 9th (DH)       — weakest slot
  { label:'Bottom',    avg:.228, kPct:.250, bbPct:.060, hrPct:.015, sbRate:.030, doublePct:.038, triplePct:.002, goPct:.218, foPct:.165 },
];

export const PITCHER_PROFILES = [
  { label:'Ace',            pos:'SP', era:2.80, kPct:.275, bbPct:.058, goD: 0.00 },
  { label:'#2 Starter',     pos:'SP', era:3.40, kPct:.245, bbPct:.072, goD: 0.00 },
  { label:'#3 Starter',     pos:'SP', era:3.90, kPct:.225, bbPct:.080, goD: 0.01 },
  { label:'Groundballer',   pos:'SP', era:3.70, kPct:.195, bbPct:.076, goD: 0.04 },
  { label:'Veteran',        pos:'SP', era:4.20, kPct:.210, bbPct:.070, goD: 0.02 },
  { label:'Power Closer',   pos:'CL', era:2.90, kPct:.285, bbPct:.065, goD: 0.00 },
  { label:'Control Closer', pos:'CL', era:3.10, kPct:.250, bbPct:.050, goD: 0.00 },
];

// ====================================================================
// MLB STRUCTURE: 2 Leagues x 3 Divisions x 5 Teams
// ====================================================================
export const MLB_STRUCTURE = {
  'American League': {
    'AL East':  ['Oceanport Marlins','Harbor City Gulls','Riverton Eagles','Bayside Cannons','Eastwick Foxes'],
    'AL Central':['Irondale Steelers','Lakewood Bisons','Northfield Wolves','Millhaven Miners','Prairie City Hawks'],
    'AL West':  ['Sunset Rockets','Desert Roadrunners','Pacific Seals','Canyon Condors','Valley Vipers'],
  },
  'National League': {
    'NL East':  ['Capital City Senators','Harborview Kings','Coastal Tides','Pinecrest Pines','Oldtown Owls'],
    'NL Central':['Heartland Huskers','River Bend Otters','Midland Monarchs','Lakeview Lobos','Great Plains Giants'],
    'NL West':  ['Sierra Stallions','Redwood Redwoods','Gold Rush Miners','Dunes Devils','Pacific Grove Pelicans'],
  }
};

export const POSITIONS = ['CF','SS','RF','1B','3B','LF','2B','C','DH'];
export const FN = ['J.','T.','D.','K.','L.','A.','N.','C.','S.','M.','P.','R.','B.','O.','E.','F.','G.','H.','V.','W.'];
export const LN = ['Mora','Walsh','Reyes','Stone','Pham','Cruz','Bell','Ford','Webb','Grant','Nash','Cole','Holt','Vance','Park','Dunn','Shaw','Lowe','Diaz','Kim','Okafor','Bishop','Petrov','Chen','Alvarez','Haynes','Marek','Vega','Lima','Brooks','Tran','Burke','Singh','Novak','Castillo','Ferreira','Jordan','Quinn','Takeda','Osei'];
export const EMOJIS = ['🧢','⚾','🏟️','🦅','🦁','🐺','🦈','🐻','🐯','🦊','🐉','⚡','🌊','🔥','❄️','🌪️'];
