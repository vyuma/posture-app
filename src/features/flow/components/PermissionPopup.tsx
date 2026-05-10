type PermissionPopupProps = {
  message: string;
  onClose: () => void;
};

export function PermissionPopup({ message, onClose }: PermissionPopupProps) {
  return (
    <section className="permission-popup-backdrop" role="dialog" aria-modal="true">
      <div className="permission-popup">
        <h2>カメラ権限を確認してください</h2>
        <p>{message}</p>
        <button
          type="button"
          className="permission-popup-close"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </section>
  );
}
