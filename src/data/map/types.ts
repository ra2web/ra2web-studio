export type MapRect = {
  x: number
  y: number
  width: number
  height: number
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
}

export type MapAiTrigger = {
  id: string
  name: string
  team1: string
  ownerHouse: string
  techLevel: number
  conditionType: number
  conditionObject: string
  comparator: string
  startingCredits: number
  sideIndex: number
  baseDefense: boolean
  team2: string
  enabledEasy: boolean
  enabledMedium: boolean
  enabledHard: boolean
  raw: string
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
