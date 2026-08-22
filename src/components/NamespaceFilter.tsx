import { SearchSelect } from '@/components/SearchSelect'

interface NamespaceFilterProps {
  namespaces: string[]
  value: string
  onChange: (value: string) => void
}

export function NamespaceFilter({ namespaces, value, onChange }: NamespaceFilterProps) {
  return (
    <SearchSelect
      ariaLabel="Namespace"
      value={value}
      options={namespaces}
      onChange={onChange}
      emptyOption={{ value: '', label: 'Все namespaces' }}
      placeholder="Все namespaces"
    />
  )
}
