import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { formatSsnOrEin, maskPii, isValidSsnOrEin } from '../utils/piiCrypto';

/**
 * PiiInput Component
 * Secure input control for collecting and editing PII (SSN / EIN / TIN).
 * Implements masking, show/hide toggle, security attributes, and validation.
 */
export function PiiInput({
  label = "Social Security Number / EIN",
  value = "",
  onChange,
  required = false,
  placeholder = "XXX-XX-XXXX",
  helperText = "Stored securely with field-level encryption. Required for tax reporting.",
  className = "form-input",
  disabled = false,
  name = "pii_field"
}) {
  const [showPii, setShowPii] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const formattedValue = formatSsnOrEin(value);
  const displayValue = showPii ? formattedValue : (isFocused ? formattedValue : maskPii(formattedValue));

  const handleChange = (e) => {
    const rawVal = e.target.value;
    const formatted = formatSsnOrEin(rawVal);
    if (onChange) {
      onChange(formatted);
    }
  };

  const isComplete = isValidSsnOrEin(formattedValue);
  const showWarning = formattedValue.length > 0 && !isComplete;

  return (
    <div className="form-group pii-input-container">
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label className="form-label" htmlFor={name} style={{ margin: 0 }}>
            {label} {required && <span style={{ color: 'var(--status-error)' }}>*</span>}
          </label>
          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 500 }}>
            <ShieldCheck size={13} /> Encrypted PII
          </span>
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={name}
          name={name}
          type={showPii ? "text" : "password"}
          value={showPii ? formattedValue : formattedValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          data-private="true"
          spellCheck="false"
          inputMode="numeric"
          className={className}
          style={{
            paddingRight: '2.5rem',
            letterSpacing: showPii ? '0.05em' : '0.15em',
            fontFamily: 'monospace, sans-serif'
          }}
        />

        <button
          type="button"
          onClick={() => setShowPii(!showPii)}
          aria-label={showPii ? "Hide sensitive tax identification number" : "Show sensitive tax identification number"}
          title={showPii ? "Hide SSN/EIN" : "Show SSN/EIN"}
          style={{
            position: 'absolute',
            right: '0.5rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'color 0.15s ease'
          }}
        >
          {showPii ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showWarning && (
        <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
          Please enter a complete 9-digit SSN or EIN (e.g. XXX-XX-XXXX).
        </div>
      )}

      {helperText && !showWarning && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {helperText}
        </div>
      )}
    </div>
  );
}
