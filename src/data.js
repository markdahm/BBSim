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
