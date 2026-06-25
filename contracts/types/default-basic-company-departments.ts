/**
 * 引导创建公司时的默认部门骨架（仅组织节点，不自动挂载部门主管 / 成员 Agent）。
 * 实际默认部门以 Admin「Default for new company」配置为准；本常量仅供文档/测试参考。
 */
export interface DefaultBasicCompanyDepartment {
  name: string;
  /** 写入 organization_nodes.description，供 UI / 记忆引用 */
  description: string;
}

export const DEFAULT_BASIC_COMPANY_DEPARTMENTS: readonly DefaultBasicCompanyDepartment[] = [
  {
    name: '销售部',
    description:
      '负责把产品/服务变成收入。包括渠道销售、大客户销售、电话销售、网络销售等。',
  },
  {
    name: '市场部',
    description:
      '负责创造客户需求和品牌认知。包括品牌管理、广告投放、数字营销、市场调研、公关等。',
  },
  {
    name: '研发/产品部',
    description:
      '负责创造或迭代产品/服务。在制造业叫「研发部」或「技术部」，在互联网公司叫「产品部」或「技术开发部」。',
  },
  {
    name: '生产/运营部',
    description:
      '负责交付产品或服务。制造业是「生产部」，服务业可能是「运营部」或「客户成功部」。',
  },
  {
    name: '人力资源部',
    description:
      '负责选、育、用、留人才。包括招聘、培训、薪酬绩效、员工关系等。',
  },
  {
    name: '财务部',
    description: '负责管钱、账、税。包括会计核算、资金管理、税务申报、预算分析等。',
  },
  {
    name: '行政部',
    description:
      '负责后勤保障和日常运转。包括办公环境、资产管理、会议接待、文书档案等。',
  },
] as const;
