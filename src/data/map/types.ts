export type MapRect = {
  x: number
  y: number
  width: number
  height: number
}

/** 视口选中：格子 + 可选步兵 subcell / 对象 id。 */
export type MapSelection = {
  rx: number
  ry: number
  subCell?: number
  objectId?: string
}

export type MapCell = {
  rx: number
  ry: number
  tileNum: number
  subTile: number
  height: number
  iceGrowth: number
  extra: number
}

export type MapTechno = {
  id: string
  owner: string
  name: string
  health: number
  rx: number
  ry: number
  direction: number
  mission: string
  tag: string
  veterancy: number
  group: number
  onBridge: boolean
  recruitable: boolean
  aiRecruitable: boolean
  subCell?: number
  poweredOn?: boolean
  upgradeCount?: number
  spotlight?: string
  upgrade1?: string
  upgrade2?: string
  upgrade3?: string
  extra: string[]
}

export type MapTerrainObject = {
  id: string
  name: string
  rx: number
  ry: number
}

export type MapSmudge = {
  id: string
  name: string
  rx: number
  ry: number
  extra: number
}

export type MapWaypoint = {
  number: number
  rx: number
  ry: number
}

export type MapCellTag = {
  rx: number
  ry: number
  tagId: string
}

export type MapTag = {
  id: string
  repeatType: number
  name: string
  triggerId: string
}

export type MapTriggerEvent = {
  type: number
  paramKind: number
  params: string[]
}

export type MapTriggerAction = {
  type: number
  params: string[]
}

export type MapTrigger = {
  id: string
  houseName: string
  attachedTriggerId: string
  name: string
  disabled: boolean
  easy: boolean
  medium: boolean
  hard: boolean
  events: MapTriggerEvent[]
  actions: MapTriggerAction[]
}

export type MapHouseNode = {
  type: string
  rx: number
  ry: number
}

export type MapHouse = {
  name: string
  iq: number
  edge: string
  country: string
  color: string
  allies: string
  credits: number
  actsLike: number
  techLevel: number
  percentBuilt: number
  playerControl: boolean
  parentCountry: string
  smartAI: boolean
  nodes: MapHouseNode[]
}

export type MapLighting = {
  ambient: number
  level: number
  red: number
  green: number
  blue: number
  ground: number
}

export type MapSpecialFlags = {
  tiberiumGrows: boolean
  tiberiumSpreads: boolean
  tiberiumExplosive: boolean
  destroyableBridges: boolean
  mcvDeploy: boolean
  initialVeteran: boolean
  fixedAlliance: boolean
  harvesterImmune: boolean
  fogOfWar: boolean
  inert: boolean
  ionStorms: boolean
  meteorites: boolean
  visceroids: boolean
}

export type MapBasic = {
  name: string
  newIniFormat: number
  multiplayerOnly: boolean
  player: string
  nextScenario: string
  altNextScenario: string
  homeCell: number
  altHomeCell: number
  percent: number
  carryOverMoney: number
  carryOverCap: number
  official: boolean
  skipScore: boolean
  oneTimeOnly: boolean
  skipMapSelect: boolean
  endOfGame: boolean
  truckCrate: boolean
  trainCrate: boolean
  tiberiumGrowthEnabled: boolean
  veinGrowthEnabled: boolean
  iceGrowthEnabled: boolean
  tiberiumDeathToVisceroid: boolean
  freeRadar: boolean
  initTime: number
  ignoreGlobalAITriggers: boolean
  intro: string
  brief: string
  win: string
  lose: string
  action: string
  postScore: string
  requiredAddOn: string
  preMapSelect: string
  startingDropships: string
  timerInherit: string
  fillSilos: string
}

export type MapScriptAction = {
  type: number
  argument: string
}

export type MapScriptType = {
  id: string
  name: string
  actions: MapScriptAction[]
}

export type MapTaskForceEntry = {
  count: number
  objectName: string
}

export type MapTaskForce = {
  id: string
  name: string
  group: number
  entries: MapTaskForceEntry[]
}

export type MapTeamType = {
  id: string
  name: string
  houseName: string
  script: string
  taskForce: string
  tag: string
  waypoint: number
  transportWaypoint: number
  veteranLevel: number
  max: number
  priority: number
  techLevel: number
  group: number
  aggressive: boolean
  annoyance: boolean
  autocreate: boolean
  droppod: boolean
  full: boolean
  guardSlower: boolean
  loadable: boolean
  looseRecruit: boolean
  onTransOnly: boolean
  prebuild: boolean
  recruiter: boolean
  reinforce: boolean
  suicide: boolean
  transportsReturnOnUnload: boolean
  useTransportOrigin: boolean
  areTeamMembersRecruitable: boolean
  onlyTargetHouseEnemy: boolean
  /** FA2 TeamTypes `Whiner`。 */
  whiner: boolean
  avoidThreats: boolean
  ionImmune: boolean
  isBaseDefense: boolean
  /** FA2 YR `MindControlDecision`。 */
  mindControlDecision: number
}

export const TEAM_BOOL_FLAGS = [
  'whiner', 'avoidThreats', 'ionImmune', 'isBaseDefense',
  'aggressive', 'annoyance', 'autocreate', 'droppod', 'full', 'guardSlower',
  'loadable', 'looseRecruit', 'onTransOnly', 'prebuild', 'recruiter', 'reinforce',
  'suicide', 'transportsReturnOnUnload', 'useTransportOrigin',
  'areTeamMembersRecruitable', 'onlyTargetHouseEnemy',
] as const

/** FA2 `CTeamTypes::OnNewteamtype` 默认值。 */
export function defaultTeamType(id: string, houseName: string): MapTeamType {
  return {
    id,
    name: 'New teamtype',
    houseName,
    script: '<none>',
    taskForce: '<none>',
    tag: '<none>',
    waypoint: -1,
    transportWaypoint: -1,
    veteranLevel: 1,
    max: 5,
    priority: 5,
    techLevel: 0,
    group: -1,
    aggressive: false,
    annoyance: false,
    autocreate: true,
    droppod: false,
    full: true,
    guardSlower: false,
    loadable: false,
    looseRecruit: false,
    onTransOnly: false,
    prebuild: false,
    recruiter: false,
    reinforce: false,
    suicide: false,
    transportsReturnOnUnload: false,
    useTransportOrigin: false,
    areTeamMembersRecruitable: false,
    onlyTargetHouseEnemy: false,
    whiner: false,
    avoidThreats: false,
    ionImmune: false,
    isBaseDefense: false,
    mindControlDecision: 0,
  }
}

export type MapAiTrigger = {
  id: string
  name: string
  team1: string
  ownerHouse: string
  techLevel: number
  /** FA2 CSV param 4（AIT_*，含 -1 None）。 */
  conditionType: number
  conditionObject: string
  /** 64 位 hex，对应 FA2 `AITrigInfo`。 */
  comparator: string
  conditionNumber: number
  conditionCmp: number
  weight: number
  minWeight: number
  maxWeight: number
  skirmish: boolean
  flag4: string
  multiSide: string
  baseDefense: boolean
  team2: string
  enabledEasy: boolean
  enabledMedium: boolean
  enabledHard: boolean
}

export type MapTube = {
  id: string
  startY: number
  startX: number
  startDir: number
  endY: number
  endX: number
  parts: number[]
}

export type MapVariable = {
  index: number
  name: string
  value: number
}

export type MapOverlayCell = {
  rx: number
  ry: number
  id: number
  value: number
}
