import React from 'react';
import { Button, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  companyName: string;
  onClose: () => void;
}

export const CompanyCreationSuccessModal: React.FC<Props> = ({ open, companyName, onClose }) => {
  const navigate = useNavigate();

  return (
    <Modal open={open} footer={null} onCancel={onClose} centered className="nc-success-modal" width={420}>
      <div className="modal">
        <div className="modal-star">✦</div>
        <h2 className="modal-title">公司已成功启动</h2>
        <p className="modal-sub">
          「{companyName}」已就绪。即将进入仪表盘查看 CEO 欢迎与今日 Heartbeat 建议。
        </p>
        <div className="modal-actions">
          <Button type="primary" size="large" block className="btn-modal-main" onClick={() => navigate('/dashboard?onboard=1')}>
            进入仪表盘
          </Button>
          <Button size="large" block className="btn-modal-sec" onClick={() => navigate('/collaboration')}>
            打开主群聊
          </Button>
          <Button size="large" block className="btn-modal-sec" onClick={() => navigate('/organization')}>
            组织工作室
          </Button>
        </div>
      </div>
    </Modal>
  );
};
