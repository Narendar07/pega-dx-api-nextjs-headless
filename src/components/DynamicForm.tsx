'use client';

import { useState } from 'react';
import type { RenderedField, CardOption } from '@/types/pega';

interface DynamicFormProps {
  fields: RenderedField[];
  onSubmit: (formData: Record<string, unknown>) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  errors?: Record<string, string>;
  title?: string;
  instructions?: string;
}

export default function DynamicForm({
  fields,
  onSubmit,
  onCancel,
  isSubmitting = false,
  errors = {},
  title,
  instructions,
}: DynamicFormProps) {
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    fields.forEach((f) => {
      initial[f.fieldID] = f.value ?? '';
    });
    return initial;
  });

  const handleChange = (fieldID: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldID]: value }));
  };

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    onSubmit(formValues);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {title && (
        <h2 className="text-xl font-semibold text-gray-900 mb-1">{title}</h2>
      )}
      {instructions && (
        <p className="text-sm text-gray-500 mb-6">{instructions}</p>
      )}

      {errors['_form'] && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-medium">{errors['_form']}</p>
        </div>
      )}

      <div className="space-y-5">
        {fields
          .filter((f) => !f.readOnly || f.value)
          .map((field) => (
            <FieldRenderer
              key={field.fieldID}
              field={field}
              value={formValues[field.fieldID]}
              onChange={(val) => handleChange(field.fieldID, val)}
              error={errors[field.fieldID]}
            />
          ))}
      </div>

      <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg
                       border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Individual Field Renderer ───

interface FieldRendererProps {
  field: RenderedField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

function FieldRenderer({ field, value, onChange, error }: FieldRendererProps) {
  const baseInputClasses = `w-full px-3 py-2 text-sm border rounded-lg transition-colors
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
    ${error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}
    ${field.readOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`;

  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );

  const errorMsg = error && (
    <p className="text-xs text-red-600 mt-1">{error}</p>
  );

  const helperText = field.helperText && !error && (
    <p className="text-xs text-gray-500 mt-1">{field.helperText}</p>
  );

  switch (field.type) {
    case 'text':
    case 'phone':
    case 'email':
    case 'url':
      return (
        <div>
          {label}
          <input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text'}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            disabled={field.disabled}
            maxLength={field.maxLength}
            className={baseInputClasses}
          />
          {errorMsg}
          {helperText}
        </div>
      );

    case 'integer':
    case 'decimal':
    case 'currency':
    case 'percentage':
      return (
        <div>
          {label}
          <input
            type="text"
            inputMode={field.type === 'integer' ? 'numeric' : 'decimal'}
            value={value !== undefined && value !== '' ? String(value) : ''}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === '') { onChange(''); return; }
              const num = field.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
              // Store as number so JSON.stringify sends a number, not a string.
              // Fall back to the raw string if parsing fails.
              onChange(isNaN(num) ? raw : num);
            }}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            disabled={field.disabled}
            className={baseInputClasses}
          />
          {errorMsg}
          {helperText}
        </div>
      );

    case 'textarea':
    case 'richtext':
      return (
        <div>
          {label}
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            disabled={field.disabled}
            rows={4}
            className={baseInputClasses}
          />
          {errorMsg}
          {helperText}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={field.disabled || field.readOnly}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label className="text-sm text-gray-700">{field.label}</label>
          {field.required && <span className="text-red-500 text-xs">*</span>}
          {errorMsg}
        </div>
      );

    case 'dropdown':
    case 'autocomplete':
      return (
        <div>
          {label}
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={field.disabled || field.readOnly}
            className={baseInputClasses}
          >
            <option value="">Select...</option>
            {(field.options || []).map((opt) => (
              <option key={opt.key} value={opt.value}>
                {opt.text}
              </option>
            ))}
          </select>
          {errorMsg}
          {helperText}
        </div>
      );

    case 'radio':
      return (
        <div>
          {label}
          <div className="space-y-2 mt-1">
            {(field.options || []).map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.fieldID}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={field.disabled || field.readOnly}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                {opt.text}
              </label>
            ))}
          </div>
          {errorMsg}
        </div>
      );

    case 'card-radio': {
      const cards: CardOption[] = field.cardOptions ?? (field.options ?? []).map((o) => o);
      const systemKeys = new Set(['classID', 'pyGUID', 'PhoneModelss', 'StorageCapacity', 'ColorOptionss']);
      return (
        <div>
          {label}
          <div className="flex flex-wrap gap-3 mt-2">
            {cards.map((card) => {
              const isSelected = value === card.value;
              const extras = card.extraData
                ? Object.entries(card.extraData)
                    .filter(([k, v]) => {
                      if (systemKeys.has(k)) return false;
                      if (typeof v === 'object') return false;
                      if (typeof v === 'string' && (v.startsWith('http') || v.length > 80)) return false;
                      return String(v).length > 0;
                    })
                    .slice(0, 3)
                : [];
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => !field.readOnly && !field.disabled && onChange(card.value)}
                  className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left
                    transition-all w-40 shrink-0
                    ${isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }
                    ${field.readOnly || field.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  {card.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.image}
                      alt={card.text}
                      className="w-full h-20 object-contain rounded-lg mb-1"
                    />
                  )}
                  <span className={`text-xs font-semibold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {card.text}
                  </span>
                  {extras.map(([k, v]) => (
                    <span key={k} className="text-xs text-gray-500">
                      {k.replace(/([A-Z])/g, ' $1').trim()}: {String(v)}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
          {errorMsg}
        </div>
      );
    }

    case 'date':
      return (
        <div>
          {label}
          <input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            readOnly={field.readOnly}
            disabled={field.disabled}
            className={baseInputClasses}
          />
          {errorMsg}
          {helperText}
        </div>
      );

    case 'datetime':
      return (
        <div>
          {label}
          <input
            type="datetime-local"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            readOnly={field.readOnly}
            disabled={field.disabled}
            className={baseInputClasses}
          />
          {errorMsg}
          {helperText}
        </div>
      );

    case 'display':
      return (
        <div>
          {label}
          <p className="text-sm text-gray-900 py-2">
            {String(value ?? '—')}
          </p>
        </div>
      );

    default:
      // Fallback: render as text input with a note about unhandled type
      return (
        <div>
          {label}
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={baseInputClasses}
          />
          <p className="text-xs text-amber-600 mt-1">
            Component type "{field.type}" rendered as text input
          </p>
          {errorMsg}
        </div>
      );
  }
}
