import type { Member, MemberId, Metrics, Diagnosis } from "./types";

// ————————————————————————————————————————————————
// SOS団 团员档案 & 属性诊断
// 「世界を大いに盛り上げるための涼宮ハルヒの団」
// ————————————————————————————————————————————————

export const MEMBERS: Record<MemberId, Member> = {
  haruhi: {
    id: "haruhi",
    jpName: "涼宮ハルヒ",
    codename: "SUZUMIYA HARUHI",
    typeName: "団長型",
    accent: "#F7A81B",
    accentSoft: "#FBE3A6",
    glyph: "団",
    quote: "我对普通的仓库没有兴趣！",
    blurb: "行动力爆表的创造者。不停开新坑，把身边所有人卷进项目里——不管他们愿不愿意。",
  },
  yuki: {
    id: "yuki",
    jpName: "長門有希",
    codename: "NAGATO YUKI",
    typeName: "情報統合型",
    accent: "#8C8FC6",
    accentSoft: "#DAD9EE",
    glyph: "情",
    quote: "……全部、読んだ。",
    blurb: "沉默寡言的情报终端。涉猎语言极广、代码深邃，不声不响却读遍了整个仓库。",
  },
  mikuru: {
    id: "mikuru",
    jpName: "朝比奈みくる",
    codename: "ASAHINA MIKURU",
    typeName: "未来人型",
    accent: "#F27C9D",
    accentSoft: "#FBD6E1",
    glyph: "未",
    quote: "那是……禁则事项です！",
    blurb: "来自未来的新面孔。刚刚抵达这条时间线，档案还很轻，但成长的可能性无限大。",
  },
  itsuki: {
    id: "itsuki",
    jpName: "古泉一樹",
    codename: "KOIZUMI ITSUKI",
    typeName: "協調者型",
    accent: "#38A46B",
    accentSoft: "#C4E7D3",
    glyph: "協",
    quote: "全て、あなたの仰る通りです（微笑）。",
    blurb: "八面玲珑的协调者。热衷协作，关注众人、被众人关注，优雅地应对各种事情。",
  },
  kyon: {
    id: "kyon",
    jpName: "キョン",
    codename: "KYON",
    typeName: "常識人型",
    accent: "#5A7A99",
    accentSoft: "#CBD8E4",
    glyph: "常",
    quote: "やれやれ……又要开始了。",
    blurb: "全员里最正常的那个。各项能力均衡，默默吐槽，却往往是团队真正的地基。",
  },
};

/**
 * 属性诊断：根据五维能力值判定最接近的团员。
 * 纯确定性——同一份数据永远得到同一结果。
 *
 * - 哈鲁希 / 长门 / 古泉 用加权点积（各自主打某几维）
 * - 实玖瑠是「新人」专精：账号越新、体量越轻越命中
 * - 阿虚是「均衡」专精：各维越平、越居中越命中（其余人都不突出时的归宿）
 */
export function diagnose(metrics: Metrics): Diagnosis {
  const a = metrics.abilities;
  // 归一化到 0–1
  const act = a.act / 100;
  const star = a.star / 100;
  const sync = a.sync / 100;
  const heat = a.heat / 100;
  const time = a.time / 100;

  const axes = [act, star, sync, heat, time];
  const mag = axes.reduce((s, v) => s + v, 0) / axes.length; // 整体体量 0–1
  const mean = mag;
  const variance = axes.reduce((s, v) => s + (v - mean) ** 2, 0) / axes.length;
  const std = Math.sqrt(variance);
  const balance = 1 - Math.min(1, std * 2.6); // 越平越接近 1

  // 加权点积（权重为该团员主打的能力维度）
  // 春日=创造+活跃；长门=持久+热量、寡言(低协调)；古泉=协调
  const haruhi = 0.36 * act + 0.3 * star + 0.06 * sync + 0.22 * heat + 0.06 * time;
  const yuki = 0.08 * act + 0.18 * star - 0.06 * sync + 0.38 * heat + 0.36 * time;
  const itsuki = 0.14 * act + 0.18 * star + 0.5 * sync + 0.12 * heat + 0.06 * time;

  // 实玖瑠：新人专精。账号越新 (1-time)、整体越轻 (1-mag)，配一点成长气 (act)
  const mikuru = 0.5 * (1 - time) + 0.32 * (1 - mag) + 0.18 * act;

  // 阿虚：均衡专精。各维越平 + 越居中越高
  const centered = 1 - Math.abs(mag - 0.5) * 2; // 越靠 0.5 越接近 1
  const kyon = 0.6 * balance + 0.4 * centered;

  const scores: Record<MemberId, number> = { haruhi, yuki, itsuki, mikuru, kyon };

  let winner: MemberId = "kyon";
  for (const id of Object.keys(scores) as MemberId[]) {
    if (scores[id] > scores[winner]) winner = id;
  }

  return { member: MEMBERS[winner], scores };
}
