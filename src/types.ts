// ————————————————————————————————————————————————
// 全局类型定义
// ————————————————————————————————————————————————
import type { Contributions } from "./contrib";

/** GitHub 用户接口返回中我们关心的字段 */
export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  location: string | null;
  company: string | null;
}

/** 仓库接口返回中我们关心的字段 */
export interface GitHubRepo {
  name: string;
  html_url: string;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  description: string | null;
}

/**
 * 跨仓库的协作/贡献统计（取自 GitHub Search API，独立限流额度）。
 * 每个字段独立获取，某项搜索失败时该项为 null，其余照常。
 */
export interface ContribStats {
  /** 该用户在全站发起的 PR 总数 */
  totalPRs: number | null;
  /** 被合并进「他人」仓库的 PR 数——衡量社区贡献的核心指标 */
  externalMergedPRs: number | null;
}

/** 一次完整拉取的原始快照（会被缓存到 localStorage） */
export interface ProfileSnapshot {
  user: GitHubUser;
  repos: GitHubRepo[];
  /** 协作贡献统计；搜索接口限流/失败时为 null，档案照常展示 */
  contrib: ContribStats | null;
  /** 近一年贡献日历（经自建代理取自 github.com）；代理失败时为 null */
  contributions: Contributions | null;
  /** 抓取时刻的时间戳（ms），用于缓存过期判断 */
  fetchedAt: number;
}

/** 五维能力值，均归一化到 0–100 */
export interface Abilities {
  /** 行動力：原创仓库产出 */
  act: number;
  /** 影響力：收到的 star 与关注者 */
  star: number;
  /** 協調力：社区贡献——向他人项目提交并被合并的 PR、发起的 PR、关注与 fork */
  sync: number;
  /** 熱量：近一年贡献总量（取自贡献热力图），衡量当下的活跃与勤勉 */
  heat: number;
  /** 継続力：账号年龄与持续度 */
  time: number;
}

/** 从原始快照派生出的、用于渲染的指标集合 */
export interface Metrics {
  abilities: Abilities;
  /** 协作贡献统计（可能为 null） */
  contrib: ContribStats | null;
  originalRepos: number;
  forkedRepos: number;
  totalStars: number;
  totalForks: number;
  /** 按 star 排序的代表作（非 fork） */
  topRepos: GitHubRepo[];
  accountAgeYears: number;
  /** 账号注册年月，如 2015-03 */
  since: string;
}

export type MemberId = "haruhi" | "yuki" | "mikuru" | "itsuki" | "kyon";

/** 一位 SOS団 团员的档案定义 */
export interface Member {
  id: MemberId;
  /** 日文全名，用于大标题 */
  jpName: string;
  /** 罗马音代号 */
  codename: string;
  /** 类型名，如「団長型」 */
  typeName: string;
  /** 属性主色 */
  accent: string;
  /** 属性主色的浅色版（用于填充） */
  accentSoft: string;
  /** 一句台词（角色语气） */
  quote: string;
  /** 诊断说明：这类团员的特征 */
  blurb: string;
  /** 徽记里的单字（团、情、未、協、常…） */
  glyph: string;
}

/** 诊断结果：命中的团员 + 各团员契合度得分（用于调试与展示） */
export interface Diagnosis {
  member: Member;
  scores: Record<MemberId, number>;
}
