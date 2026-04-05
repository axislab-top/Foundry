import React from 'react';

export const AuditPage: React.FC = () => {
  return (
    <div className="content-area">
      <div className="page-header">
        <div className="page-title">审计日志</div>
      </div>
      <div className="panel">
        <p className="orgos-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          此处将展示治理与操作审计记录。接入审计流后，可按时间与主体筛选。
        </p>
      </div>
    </div>
  );
};
