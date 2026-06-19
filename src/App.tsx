import { useState } from 'react'

type Errors = {
  name?: string
  email?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(values: { name: string; email: string }): Errors {
  const errors: Errors = {}

  if (!values.name.trim()) {
    errors.name = 'Name is required'
  } else if (values.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters'
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address'
  }

  return errors
}

function App() {
  const [values, setValues] = useState({ name: '', email: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState<{ name: string; email: string } | null>(null)

  function handleChange(field: 'name' | 'email') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...values, [field]: e.target.value }
      setValues(next)
      // Re-validate the touched field once the user has seen an error.
      if (errors[field]) setErrors(validate(next))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) {
      setSubmitted({ name: values.name.trim(), email: values.email.trim() })
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-white">Confirm your details</h1>
          <p className="mt-1 text-sm text-gray-400">
            A quick form to validate the setup.
          </p>
        </header>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <p className="text-sm font-medium text-emerald-300">Submitted ✓</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Name</dt>
                <dd className="text-gray-100">{submitted.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Email</dt>
                <dd className="text-gray-100">{submitted.email}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => {
                setSubmitted(null)
                setValues({ name: '', email: '' })
                setErrors({})
              }}
              className="mt-4 text-sm text-emerald-300 underline-offset-2 hover:underline"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl"
          >
            <Field
              id="name"
              label="Name"
              type="text"
              placeholder="Jane Doe"
              value={values.name}
              error={errors.name}
              onChange={handleChange('name')}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="jane@example.com"
              value={values.email}
              error={errors.email}
              onChange={handleChange('email')}
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              Continue
            </button>
          </form>
        )}
      </main>
    </div>
  )
}

type FieldProps = {
  id: string
  label: string
  type: string
  placeholder: string
  value: string
  error?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function Field({ id, label, type, placeholder, value, error, onChange }: FieldProps) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-300">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 ${
          error
            ? 'border-red-500/60 focus-visible:ring-red-500/50'
            : 'border-white/10 focus-visible:ring-indigo-400/60'
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export default App
