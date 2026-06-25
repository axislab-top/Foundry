import { useEffect, useState, type ReactElement } from 'react';
import { Select } from 'antd';
import { listCompanies } from '../../api';
import type { CompanyOption } from '../../types';

type Props = {
  value?: string;
  onChange: (companyId: string | undefined) => void;
  style?: React.CSSProperties;
};

export function CompanySelect({ value, onChange, style }: Props): ReactElement {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listCompanies()
      .then((items) => {
        if (!cancelled) setOptions(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Select
      showSearch
      allowClear
      placeholder="全部公司（可选筛选）"
      style={{ minWidth: 260, ...style }}
      loading={loading}
      value={value}
      onChange={(v) => onChange(v)}
      optionFilterProp="label"
      options={options.map((c) => ({
        value: c.id,
        label: `${c.name} (${c.id.slice(0, 8)}…)`,
      }))}
    />
  );
}
