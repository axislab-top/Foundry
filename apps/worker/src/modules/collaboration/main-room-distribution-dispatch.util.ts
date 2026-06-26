/**
 * 主群：编排产出「部门分工草稿」后，用户确认可下发至各部门群时的短句解析（保守）。
 *
 * **执行入口**已改为 replay 委托 + `heavyPipelineKind` + Redis 校验；本模块保留供单测与辅助匹配。
 */

/**
 * 含与战略目标相同的「定稿 / 确认下发」类短句（便于用户连续两次定稿：战略 → 部门草稿）；
 * 另含仅针对部门分工的确认用语。
 */
export function isConfirmDistributionDispatchMessage(rawText: string): boolean {
  const t = String(rawText ?? '').trim().replace(/\s+/g, '');
  if (t.length < 2 || t.length > 120) return false;

  if (
    /^(确认部门分工|下发各部门|确认协作分工|确认下发部门|同意部门分工|同意进入部门编排|没有修改意见|可以下发部门)$/.test(
      t,
    )
  ) {
    return true;
  }
  if (t.length <= 48) {
    if (/确认下发到部门|下发到各部门|就按这个部门分工|同意此分工|不再修改部门/.test(t)) return true;
    if (/可以下发|同意下发|就这样下发|按部门分工执行/.test(t)) return true;
  }
  if (t.length <= 12) {
    if (/^(可以了|开始吧|好了|确认|ok)$/.test(t)) return true;
  }
  return false;
}
