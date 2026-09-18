interface Props {
  open: boolean;
  onCancel: () => void;
  onAccept: () => void;
}

const DISCLAIMER_TEXT = `【全自动投递风险提示与免责声明】

1. 本功能的「全自动投递」通过浏览器扩展辅助操作 BOSS 直聘页面，不属于 BOSS 官方功能。
2. 使用自动化批量浏览、沟通、发送消息等行为，可能违反 BOSS 直聘用户协议或平台规则，存在限流、禁言、封号等风险，后果由您自行承担。
3. 本工具不保证投递成功率、面试邀约或录用结果；生成的话术仅供参考，请您自行核对后发送。
4. 建议您合理设置间隔与数量，优先人工确认内容；开启「自动点击发送」风险更高。
5. 开发者不对因使用本功能导致的账号异常、数据丢失、第三方平台处罚等承担法律责任。

点击「我已阅读并同意」即表示您理解上述风险并自愿使用本功能。`;

export default function DeliveryDisclaimerModal({ open, onCancel, onAccept }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>使用前请阅读</h3>
        <pre className="disclaimer-text">{DISCLAIMER_TEXT}</pre>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={onAccept}>
            我已阅读并同意
          </button>
        </div>
      </div>
    </div>
  );
}
