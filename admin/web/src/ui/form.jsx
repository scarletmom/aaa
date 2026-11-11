export function Field({ label, htmlFor, hint, error, actions, children }) {
  return (
    <div className={`form-field${error ? " has-error" : ""}`}>
      <div className="form-field-head">
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
        {actions && <span className="form-field-actions">{actions}</span>}
      </div>
      {children}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="form-hint">{hint}</p>
      )}
    </div>
  );
}

export function TextArea({ className = "", ...rest }) {
  return <textarea className={`field-box text-area ${className}`} {...rest} />;
}
