import type {
  ActivityEntry, ChangeRecord, Feature, GithubLink, NotificationItem, Project, ProjectModule,
  Task, TaskBranch, TaskGroup, User,
} from './domain'
import { TODAY } from './domain'
import type { DataSnapshot } from './selectors'
export const CURRENT_USER_ID = 'u-lin'
export const seedUsers: User[] = [
  { id: 'u-lin', name: '林一', initials: 'LY', email: 'lin@inpulse.dev', roleLabel: '系统管理员', isAdmin: true, active: true },
  { id: 'u-zhou', name: '周宁', initials: 'ZN', email: 'zhou@inpulse.dev', roleLabel: '项目成员', isAdmin: false, active: true },
  { id: 'u-xu', name: '许然', initials: 'XR', email: 'xu@inpulse.dev', roleLabel: '项目成员', isAdmin: false, active: true },
  { id: 'u-chen', name: '陈澈', initials: 'CC', email: 'chen@inpulse.dev', roleLabel: '项目成员', isAdmin: false, active: true },
  { id: 'u-meng', name: '孟桐', initials: 'MT', email: 'meng@inpulse.dev', roleLabel: '项目成员', isAdmin: false, active: true },
]
export const seedProjects: Project[] = [
  { id: 'p-agv', code: 'AGV-OPS', name: 'AGV 智能搬运平台', type: 'AGV', color: 'cyan', description: '面向工厂搬运场景的多车协同与任务调度平台。', status: '正常', createdById: 'u-lin', createdAt: '2026-03-02', memberIds: ['u-lin', 'u-zhou', 'u-xu', 'u-chen'] },
  { id: 'p-rcs', code: 'RCS-CORE', name: 'RCS 机器人调度系统', type: 'RCS', color: 'blue', description: '统一接入 AMR / AGV，提供交通管制与设备编排能力。', status: '正常', createdById: 'u-zhou', createdAt: '2026-04-18', memberIds: ['u-lin', 'u-zhou', 'u-chen', 'u-meng'] },
  { id: 'p-wes', code: 'WES-NOVA', name: 'WES 仓储执行系统', type: 'WES', color: 'amber', description: '连接 WMS、设备与现场作业的实时执行中枢。', status: '正常', createdById: 'u-xu', createdAt: '2026-06-05', memberIds: ['u-lin', 'u-xu', 'u-zhou', 'u-meng'] },
]

const moduleDefaults = { responsibility: '', status: '正常' as const, updatedAt: '2026-09-01' }

function projectModule(input: Partial<ProjectModule> & Pick<ProjectModule, 'id' | 'code' | 'name' | 'projectId' | 'summary'>): ProjectModule {
  return { ...moduleDefaults, ...input }
}
export const seedModules: ProjectModule[] = [
  projectModule({ id: 'm-agv-sched', code: 'MOD-AGV-01', name: '任务调度', projectId: 'p-agv', summary: '任务池、优先级、路径规划与多车协同。', responsibility: '负责作业任务的分配、路径规划与充电编排；不负责地图数据本身。' }),
  projectModule({ id: 'm-agv-map', code: 'MOD-AGV-02', name: '地图与站点', projectId: 'p-agv', summary: '地图版本、站点拓扑与禁行区配置。', responsibility: '负责地图版本、站点拓扑与禁行区；调度策略由任务调度模块承担。', updatedAt: '2026-09-04' }),
  projectModule({ id: 'm-rcs-device', code: 'MOD-RCS-01', name: '设备接入', projectId: 'p-rcs', summary: 'AGV 协议适配、心跳、状态与告警。', responsibility: '负责设备连接、协议适配与在线状态维护。' }),
  projectModule({ id: 'm-rcs-traffic', code: 'MOD-RCS-02', name: '交通管制', projectId: 'p-rcs', summary: '区域锁、死锁检测、拥塞与通行策略。', responsibility: '负责通行资源分配与死锁处理；不直接下发设备指令。', updatedAt: '2026-09-05' }),
  projectModule({ id: 'm-wes-inventory', code: 'MOD-WES-01', name: '库存执行', projectId: 'p-wes', summary: 'WMS 任务下发、库存锁定与执行回传。', responsibility: '负责入库、出库与波次执行的现场闭环。' }),
  projectModule({ id: 'm-wes-alarm', code: 'MOD-WES-02', name: '异常告警', projectId: 'p-wes', summary: '异常分级、通知策略与闭环追踪。', responsibility: '负责异常分级与通知策略；具体处置由业务模块完成。', updatedAt: '2026-08-28' }),
]

const featureDefaults = { currentBehavior: '', acceptance: '', status: '正常' as const, updatedAt: '2026-09-01' }

function feature(input: Partial<Feature> & Pick<Feature, 'id' | 'code' | 'name' | 'projectId' | 'moduleId' | 'summary'>): Feature {
  return { ...featureDefaults, ...input }
}
export const seedFeatures: Feature[] = [
  feature({ id: 'f-path', code: 'AGV-F-01', name: '多车路径规划', projectId: 'p-agv', moduleId: 'm-agv-sched', summary: '协调多车路线，减少路径冲突与等待。', currentBehavior: '根据任务优先级与站点占用规划路线；检测到冲突时执行等待与回退策略，窄巷道会车采用让行规则。', acceptance: '高峰期规划耗时低于 400ms；仿真场景通过率不低于 99%；冲突回退不产生死锁。', updatedAt: '2026-09-05' }),
  feature({ id: 'f-charge', code: 'AGV-F-02', name: '充电任务编排', projectId: 'p-agv', moduleId: 'm-agv-sched', summary: '根据电量与作业负载安排充电。', currentBehavior: '结合设备电量、充电站可用性与待执行任务生成充电计划，低电量阈值与时段可配置。', acceptance: '低电量触发后能自动恢复作业；参数修改无需重启服务。', updatedAt: '2026-08-18' }),
  feature({ id: 'f-topo', code: 'AGV-F-03', name: '站点拓扑校验', projectId: 'p-agv', moduleId: 'm-agv-map', summary: '校验地图版本与站点连通性。', currentBehavior: '地图发布前校验站点编码唯一性与连通性，异常站点标记为不可用。', acceptance: '重复站点编码在发布前被拦截；不可用站点不参与调度。', updatedAt: '2026-09-04' }),
  feature({ id: 'f-heartbeat', code: 'RCS-F-01', name: '心跳监控', projectId: 'p-rcs', moduleId: 'm-rcs-device', summary: '跟踪设备在线状态与异常重连。', currentBehavior: '接收设备心跳，超过阈值判定离线，连接恢复后重新同步设备状态。', acceptance: '离线判定误报率低于 1%；恢复后状态与设备实际一致。', updatedAt: '2026-09-06' }),
  feature({ id: 'f-protocol', code: 'RCS-F-02', name: '协议适配', projectId: 'p-rcs', moduleId: 'm-rcs-device', summary: '适配不同厂商 AGV 通信协议。', currentBehavior: '通过适配层统一指令与状态字段，新增厂商以配置方式接入。', acceptance: '新增厂商无需修改调度核心代码。', updatedAt: '2026-09-02' }),
  feature({ id: 'f-regionlock', code: 'RCS-F-03', name: '区域锁与死锁检测', projectId: 'p-rcs', moduleId: 'm-rcs-traffic', summary: '管理通行资源占用与死锁解除。', currentBehavior: '按区域粒度加锁，检测到环形等待时选择优先级较低的车辆回退。', acceptance: '死锁在 3 秒内被检测并自动解除；不出现人工干预。', updatedAt: '2026-09-05' }),
  feature({ id: 'f-inbound', code: 'WES-F-01', name: '站点入库校验', projectId: 'p-wes', moduleId: 'm-wes-inventory', summary: '校验入库站点与作业前置条件。', currentBehavior: '校验站点可用性、库存约束与设备就绪状态，避免无效任务下发。', acceptance: '不满足前置条件时任务不下发并给出明确原因。', updatedAt: '2026-09-06' }),
  feature({ id: 'f-wave', code: 'WES-F-02', name: '波次拆分策略', projectId: 'p-wes', moduleId: 'm-wes-inventory', summary: '按执行能力拆分仓储作业波次。', currentBehavior: '结合订单规模与设备吞吐量分配批次，波次取消时回收剩余任务。', acceptance: '波次取消后无残留任务；拆分结果与实际吞吐匹配。', updatedAt: '2026-08-30' }),
  feature({ id: 'f-alarm-level', code: 'WES-F-03', name: '告警分级策略', projectId: 'p-wes', moduleId: 'm-wes-alarm', summary: '按影响范围划分告警等级与通知对象。', currentBehavior: '按影响范围与持续时长划分等级，仅通知需要处置的人员。', acceptance: '同一异常不重复通知；高等级告警必须有人认领。' }),
]

const taskDefaults = {
  description: '', scope: '功能级' as Task['scope'], impactFeatureIds: [] as string[],
  priority: '普通' as Task['priority'], workStatus: '未完成' as Task['workStatus'],
  lifecycleStatus: '正常' as Task['lifecycleStatus'], createdAt: '2026-08-01', updatedAt: TODAY,
  rowVersion: 1, githubLinks: [] as GithubLink[],
}

function task(input: Partial<Task> & Pick<Task, 'code' | 'title' | 'projectId' | 'moduleId' | 'assigneeId' | 'creatorId'>): Task {
  return { ...taskDefaults, ...input, id: `task-${input.code.toLowerCase()}` }
}

const prLink = (id: string, number: string, repo: string): GithubLink => ({
  id, kind: 'PR', label: `${repo} PR ${number}`, url: `https://github.com/inpulse-demo/${repo}/pull/${number.replace('#', '')}`, number,
})
export const seedTasks: Task[] = [
  task({ code: 'T-101', title: '修复多车路径规划冲突回退策略', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', assigneeId: 'u-zhou', creatorId: 'u-lin', priority: '高', workStatus: '未完成', dueAt: TODAY, createdAt: '2026-08-20', updatedAt: '2026-09-07', rowVersion: 4, taskGroupId: 'tg-001', description: '高峰期多车同时进入窄巷道时，冲突回退会连续触发导致车辆原地等待。需要把回退策略改为分层让行，并补充仿真验证。', githubLinks: [prLink('gl-1', '#184', 'agv-platform')] }),
  task({ code: 'T-108', title: '窄巷道会车死锁回退补丁', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', assigneeId: 'u-lin', creatorId: 'u-zhou', priority: '高', workStatus: '已完成', completedAt: '2026-08-22', createdAt: '2026-08-15', updatedAt: '2026-08-25', rowVersion: 3, taskGroupId: 'tg-001', description: '现场反馈窄巷道会车出现短暂死锁，先以补丁方式恢复通行。', githubLinks: [{ id: 'gl-2', kind: 'Commit', label: 'agv-platform 8f3a1c2', url: 'https://github.com/inpulse-demo/agv-platform/commit/8f3a1c2', number: '8f3a1c2' }] }),
  task({ code: 'T-112', title: '路径规划冲突日志采集', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', assigneeId: 'u-xu', creatorId: 'u-lin', priority: '普通', workStatus: '未完成', dueAt: '2026-09-12', createdAt: '2026-08-26', updatedAt: '2026-09-01', rowVersion: 2, taskGroupId: 'tg-001', description: '为冲突回退策略补充结构化日志，便于后续复盘与阈值调整。' }),
  task({ code: 'T-105', title: '充电任务编排参数化', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-charge', assigneeId: 'u-chen', creatorId: 'u-lin', priority: '普通', workStatus: '已完成', completedAt: '2026-08-18', createdAt: '2026-08-06', updatedAt: '2026-08-18', rowVersion: 2, description: '不同现场充电阈值不同，把低电量阈值与充电时段改为可配置参数。' }),
  task({ code: 'T-118', title: '站点拓扑版本升级与兼容处理', projectId: 'p-agv', moduleId: 'm-agv-map', assigneeId: 'u-lin', creatorId: 'u-lin', priority: '普通', scope: '模块级', impactFeatureIds: ['f-topo', 'f-path'], workStatus: '未完成', dueAt: '2026-09-18', createdAt: '2026-09-01', updatedAt: '2026-09-06', rowVersion: 2, description: '统一升级地图版本结构，同时保证旧版站点编码在调度侧可用。属于跨功能的共同技术工作。' }),
  task({ code: 'T-120', title: '地图禁行区配置校验', projectId: 'p-agv', moduleId: 'm-agv-map', featureId: 'f-topo', assigneeId: 'u-xu', creatorId: 'u-xu', priority: '低', workStatus: '已取消', cancelReason: '需求并入 T-118 站点拓扑版本升级，避免重复改造。', createdAt: '2026-08-28', updatedAt: '2026-09-02', rowVersion: 2 }),
  task({ code: 'T-126', title: 'RCS 心跳超时重连机制', projectId: 'p-rcs', moduleId: 'm-rcs-device', featureId: 'f-heartbeat', assigneeId: 'u-zhou', creatorId: 'u-lin', priority: '紧急', workStatus: '未完成', dueAt: '2026-09-05', createdAt: '2026-08-24', updatedAt: '2026-09-07', rowVersion: 5, description: '设备断网后重连会出现状态不一致，需要引入带退避的重连与状态重同步。', githubLinks: [{ id: 'gl-3', kind: 'Issue', label: 'rcs-core Issue #92', url: 'https://github.com/inpulse-demo/rcs-core/issues/92', number: '#92' }] }),
  task({ code: 'T-131', title: 'AGV 协议适配回归测试', projectId: 'p-rcs', moduleId: 'm-rcs-device', featureId: 'f-protocol', assigneeId: 'u-chen', creatorId: 'u-zhou', priority: '普通', workStatus: '已完成', completedAt: '2026-09-02', completionReason: '测试验证', completionNote: '仅完成回归测试验证，不涉及功能代码变化。', createdAt: '2026-08-30', updatedAt: '2026-09-02', rowVersion: 2 }),
  task({ code: 'T-135', title: '区域锁死锁检测阈值调整', projectId: 'p-rcs', moduleId: 'm-rcs-traffic', featureId: 'f-regionlock', assigneeId: 'u-lin', creatorId: 'u-meng', priority: '高', workStatus: '未完成', dueAt: '2026-09-10', createdAt: '2026-09-02', updatedAt: '2026-09-06', rowVersion: 2, description: '当前阈值在高密度场景下会误判死锁，需要按区域车流密度动态调整。' }),
  task({ code: 'T-140', title: '交通管制策略统一改造', projectId: 'p-rcs', moduleId: 'm-rcs-traffic', assigneeId: 'u-zhou', creatorId: 'u-lin', priority: '普通', scope: '模块级', impactFeatureIds: ['f-regionlock', 'f-heartbeat'], workStatus: '未完成', dueAt: '2026-09-20', createdAt: '2026-08-29', updatedAt: '2026-09-04', rowVersion: 3, description: '把区域锁与离线设备的通行资源回收统一到一套策略中。' }),
  task({ code: 'T-146', title: '站点入库校验规则梳理', projectId: 'p-wes', moduleId: 'm-wes-inventory', featureId: 'f-inbound', assigneeId: 'u-xu', creatorId: 'u-xu', priority: '普通', workStatus: '未完成', dueAt: '2026-09-11', createdAt: '2026-09-03', updatedAt: '2026-09-06', rowVersion: 2, description: '现场反馈校验失败原因不明确，需要梳理规则并补充提示文案。' }),
  task({ code: 'T-150', title: '波次拆分策略压测与指标采集', projectId: 'p-wes', moduleId: 'm-wes-inventory', featureId: 'f-wave', assigneeId: 'u-lin', creatorId: 'u-lin', priority: '低', workStatus: '未完成', dueAt: '2026-09-14', createdAt: '2026-09-04', updatedAt: '2026-09-04', rowVersion: 1 }),
  task({ code: 'T-155', title: '波次取消后剩余任务回收', projectId: 'p-wes', moduleId: 'm-wes-inventory', featureId: 'f-wave', assigneeId: 'u-zhou', creatorId: 'u-xu', priority: '高', workStatus: '已完成', completedAt: '2026-08-30', createdAt: '2026-08-21', updatedAt: '2026-08-30', rowVersion: 3, description: '波次取消后剩余任务未回收，导致设备空跑。' }),
  task({ code: 'T-160', title: '告警分级策略接入', projectId: 'p-wes', moduleId: 'm-wes-alarm', featureId: 'f-alarm-level', assigneeId: 'u-chen', creatorId: 'u-meng', priority: '普通', workStatus: '未完成', dueAt: '2026-09-16', createdAt: '2026-09-05', updatedAt: '2026-09-05', rowVersion: 1 }),
  task({ code: 'T-163', title: '心跳恢复状态一致性排查', projectId: 'p-rcs', moduleId: 'm-rcs-device', featureId: 'f-heartbeat', assigneeId: 'u-meng', creatorId: 'u-zhou', priority: '普通', workStatus: '未完成', dueAt: '2026-09-09', createdAt: '2026-09-06', updatedAt: '2026-09-07', rowVersion: 2, description: '排查设备离线恢复后状态与调度侧不一致的具体路径。' }),
]
export const seedGroups: TaskGroup[] = [
  { id: 'tg-001', code: 'TG-001', name: '路径规划冲突回退', projectId: 'p-agv', mainTaskId: 'task-t-101', status: '进行中', createdById: 'u-lin', createdAt: '2026-08-25' },
]
export const seedBranches: TaskBranch[] = [
  { id: 'tb-001', taskGroupId: 'tg-001', taskId: 'task-t-101', branchRole: 'MAIN', branchMode: '活动来源', originalWorkStatus: '未完成', originalAssigneeId: 'u-zhou', status: '生效', joinedAt: '2026-08-25' },
  { id: 'tb-002', taskGroupId: 'tg-001', taskId: 'task-t-108', branchRole: 'SOURCE', branchMode: '历史来源', originalWorkStatus: '已完成', originalAssigneeId: 'u-lin', status: '生效', joinedAt: '2026-08-25' },
  { id: 'tb-003', taskGroupId: 'tg-001', taskId: 'task-t-112', branchRole: 'SOURCE', branchMode: '活动来源', originalWorkStatus: '未完成', originalAssigneeId: 'u-xu', status: '生效', joinedAt: '2026-08-26' },
]

const recordDefaults = {
  scope: '功能级' as ChangeRecord['scope'], impactFeatureIds: [] as string[], leftover: '',
  status: '已发布' as ChangeRecord['status'], version: 1, versions: [] as ChangeRecord['versions'],
  githubLinks: [] as GithubLink[],
}

function record(input: Partial<ChangeRecord> & Pick<ChangeRecord, 'code' | 'title' | 'projectId' | 'authorId' | 'createdAt' | 'why' | 'what' | 'result'>): ChangeRecord {
  return { ...recordDefaults, ...input, id: `rec-${input.code.toLowerCase()}` }
}
export const seedRecords: ChangeRecord[] = [
  record({ code: 'CR-201', title: '充电策略支持参数配置', taskId: 'task-t-105', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-charge', authorId: 'u-chen', createdAt: '2026-08-18', publishedAt: '2026-08-18', why: '不同现场的充电阈值不同，固定参数不便调整。', what: '将低电量阈值和充电时段改为可配置参数，并在配置变更时热加载。', result: '已验证低电量触发与充电任务恢复场景，参数修改无需重启服务。', leftover: '高峰期多车同时等待充电的调度策略仍需优化。' }),
  record({ code: 'CR-205', title: '波次取消后的任务回收与状态同步', taskId: 'task-t-155', projectId: 'p-wes', moduleId: 'm-wes-inventory', featureId: 'f-wave', authorId: 'u-zhou', createdAt: '2026-08-30', publishedAt: '2026-08-30', why: '波次取消后剩余任务未回收，设备继续空跑造成现场拥堵。', what: '在波次取消时按批次回收未开始任务，并同步 WMS 侧状态。', result: '模拟取消 300 单波次，剩余任务全部回收，无设备空跑。', leftover: '跨库位场景的回收告警策略尚未覆盖。' }),
  record({ code: 'CR-208', title: '窄巷道会车回退策略补丁', taskId: 'task-t-108', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', authorId: 'u-lin', createdAt: '2026-08-22', publishedAt: '2026-08-22', why: '现场窄巷道会车出现短暂死锁，需要快速恢复通行。', what: '为窄巷道增加让行优先级判断，冲突时由负载较低的车辆回退。', result: '现场连续 3 天未复现死锁；该补丁为临时方案，后续由 T-101 统一重构。', githubLinks: [{ id: 'gl-4', kind: 'Commit', label: 'agv-platform 8f3a1c2', url: 'https://github.com/inpulse-demo/agv-platform/commit/8f3a1c2', number: '8f3a1c2' }] }),
  record({
    code: 'CR-212', title: '路径规划冲突检测提前量调整', taskId: 'task-t-101', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', authorId: 'u-zhou', createdAt: '2026-09-01', publishedAt: '2026-09-01', version: 2,
    why: '冲突检测触发过晚，回退已经无法避免等待。',
    what: '把冲突检测提前量从 2 个路段调整为 4 个路段，并按车速动态修正。',
    result: '仿真场景平均规划耗时从 820ms 降至 340ms，通过率 99.2%；已在预发环境完成 2 轮回归。',
    leftover: '低速密集场景下的提前量仍需单独标定。',
    versions: [
      { version: 1, why: '冲突检测触发过晚，回退已经无法避免等待。', what: '把冲突检测提前量从 2 个路段调整为 4 个路段。', result: '仿真场景平均规划耗时下降至 380ms。', leftover: '', editedById: 'u-zhou', editedAt: '2026-09-01', note: '首次发布' },
      { version: 2, why: '冲突检测触发过晚，回退已经无法避免等待。', what: '把冲突检测提前量从 2 个路段调整为 4 个路段，并按车速动态修正。', result: '仿真场景平均规划耗时从 820ms 降至 340ms，通过率 99.2%；已在预发环境完成 2 轮回归。', leftover: '低速密集场景下的提前量仍需单独标定。', editedById: 'u-lin', editedAt: '2026-09-05', note: '补充车速修正逻辑、完整验证数据与遗留问题' },
    ],
  }),
  record({ code: 'CR-215', title: '入库站点校验规则整理', taskId: 'task-t-146', projectId: 'p-wes', moduleId: 'm-wes-inventory', featureId: 'f-inbound', authorId: 'u-xu', createdAt: '2026-09-06', status: '草稿', why: '现场反馈校验失败原因不明确。', what: '', result: '' }),
  record({ code: 'CR-218', title: '心跳离线判定阈值下调', projectId: 'p-rcs', moduleId: 'm-rcs-device', featureId: 'f-heartbeat', authorId: 'u-meng', createdAt: '2026-09-02', publishedAt: '2026-09-02', status: '已作废', voidReason: '阈值调整实际未随该版本发布，记录与线上行为不符。', voidedAt: '2026-09-03', why: '离线判定过慢，设备异常后调度侧感知延迟。', what: '将心跳离线判定阈值从 15 秒下调至 8 秒。', result: '灰度环境离线感知延迟下降。' }),
  record({ code: 'CR-224', title: '交通管制策略统一改造第一阶段', taskId: 'task-t-140', projectId: 'p-rcs', moduleId: 'm-rcs-traffic', authorId: 'u-zhou', createdAt: '2026-09-04', publishedAt: '2026-09-04', scope: '模块级', impactFeatureIds: ['f-regionlock', 'f-heartbeat'], why: '区域锁与离线设备的通行资源回收分散在两处实现，容易出现资源泄漏。', what: '抽出统一的通行资源管理器，区域锁释放与离线回收走同一条路径。', result: '构造 12 组资源占用场景，全部正确释放；未再出现锁残留。', leftover: '高密度场景下的动态阈值仍由 T-135 跟进。', githubLinks: [prLink('gl-5', '#57', 'rcs-core')] }),
]
export const seedActivity: ActivityEntry[] = [
  { id: 'act-01', at: '2026-09-08 09:12', actorId: 'u-lin', action: '发布了迭代记录', targetType: '迭代记录', targetId: 'rec-cr-224', targetTitle: 'CR-224 交通管制策略统一改造第一阶段', projectId: 'p-rcs', detail: '模块级记录，影响 2 个功能' },
  { id: 'act-02', at: '2026-09-08 08:47', actorId: 'u-zhou', action: '更新了任务优先级', targetType: '任务', targetId: 'task-t-126', targetTitle: 'T-126 RCS 心跳超时重连机制', projectId: 'p-rcs', detail: '高 → 紧急', snapshot: 'rowVersion 4 → 5；优先级由「高」调整为「紧急」，截止 2026-09-05 已逾期。' },
  { id: 'act-03', at: '2026-09-07 18:20', actorId: 'u-xu', action: '保存了迭代草稿', targetType: '迭代记录', targetId: 'rec-cr-215', targetTitle: 'CR-215 入库站点校验规则整理', projectId: 'p-wes', detail: '草稿，未进入功能历史' },
  { id: 'act-04', at: '2026-09-07 15:02', actorId: 'u-lin', action: '修改了已发布记录', targetType: '迭代记录', targetId: 'rec-cr-212', targetTitle: 'CR-212 路径规划冲突检测提前量调整', projectId: 'p-agv', detail: '生成版本 v2，原版本保留', snapshot: 'version 1 → 2；补充车速修正逻辑与完整验证数据。' },
  { id: 'act-05', at: '2026-09-06 11:35', actorId: 'u-meng', action: '创建了任务', targetType: '任务', targetId: 'task-t-163', targetTitle: 'T-163 心跳恢复状态一致性排查', projectId: 'p-rcs', detail: '指派给 孟桐' },
  { id: 'act-06', at: '2026-09-05 16:48', actorId: 'u-zhou', action: '添加了 GitHub 链接', targetType: 'GitHub', targetId: 'task-t-101', targetTitle: 'T-101 修复多车路径规划冲突回退策略', projectId: 'p-agv', detail: 'PR #184' },
  { id: 'act-07', at: '2026-09-03 10:15', actorId: 'u-lin', action: '作废了迭代记录', targetType: '迭代记录', targetId: 'rec-cr-218', targetTitle: 'CR-218 心跳离线判定阈值下调', projectId: 'p-rcs', detail: '高风险操作，已记录原因', snapshot: 'status PUBLISHED → VOID；原因：阈值调整实际未随该版本发布。' },
  { id: 'act-08', at: '2026-09-02 14:26', actorId: 'u-chen', action: '完成了任务', targetType: '任务', targetId: 'task-t-131', targetTitle: 'T-131 AGV 协议适配回归测试', projectId: 'p-rcs', detail: '完成说明：测试验证，无迭代记录' },
  { id: 'act-09', at: '2026-08-30 17:05', actorId: 'u-zhou', action: '完成任务并发布记录', targetType: '任务', targetId: 'task-t-155', targetTitle: 'T-155 波次取消后剩余任务回收', projectId: 'p-wes', detail: '同一事务内生成 CR-205' },
  { id: 'act-10', at: '2026-08-26 09:40', actorId: 'u-lin', action: '合并了任务', targetType: '任务', targetId: 'task-t-112', targetTitle: 'T-112 路径规划冲突日志采集', projectId: 'p-agv', detail: '并入聚合组 TG-001，活动来源分支', snapshot: 'task_group_id null → tg-001；branch_role SOURCE；branch_mode ACTIVE。' },
  { id: 'act-11', at: '2026-08-25 13:18', actorId: 'u-lin', action: '合并了任务', targetType: '任务', targetId: 'task-t-108', targetTitle: 'T-108 窄巷道会车死锁回退补丁', projectId: 'p-agv', detail: '并入聚合组 TG-001，历史来源分支' },
  { id: 'act-12', at: '2026-08-25 13:10', actorId: 'u-lin', action: '创建了任务聚合组', targetType: '任务', targetId: 'tg-001', targetTitle: 'TG-001 路径规划冲突回退', projectId: 'p-agv', detail: '主任务 T-101' },
  { id: 'act-13', at: '2026-08-20 10:02', actorId: 'u-lin', action: '添加了项目成员', targetType: '成员', targetId: 'u-chen', targetTitle: '陈澈 加入 AGV 智能搬运平台', projectId: 'p-agv', detail: '系统管理员操作' },
]
export const seedNotifications: NotificationItem[] = [
  { id: 'ntf-01', at: '2026-09-08 09:12', text: 'CR-224 交通管制策略统一改造第一阶段 已发布，影响你负责的区域锁功能。', read: false, recordCode: 'CR-224' },
  { id: 'ntf-02', at: '2026-09-08 08:47', text: 'T-126 RCS 心跳超时重连机制 已逾期 3 天，优先级提升为紧急。', read: false, taskCode: 'T-126' },
  { id: 'ntf-03', at: '2026-09-07 15:02', text: 'CR-212 路径规划冲突检测提前量调整 生成了新版本 v2。', read: false, recordCode: 'CR-212' },
  { id: 'ntf-04', at: '2026-09-05 16:48', text: 'T-101 修复多车路径规划冲突回退策略 关联了 PR #184。', read: true, taskCode: 'T-101' },
]
export const seedData: DataSnapshot = {
  users: seedUsers,
  projects: seedProjects,
  modules: seedModules,
  features: seedFeatures,
  tasks: seedTasks,
  records: seedRecords,
  groups: seedGroups,
  branches: seedBranches,
  activity: seedActivity,
  notifications: seedNotifications,
}
