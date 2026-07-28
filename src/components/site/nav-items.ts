export interface NavItem {
  label: string
  href: string
  destination: string
}

export const navItems: NavItem[] = [
  { label: 'Головна', href: '#top', destination: '/' },
  { label: 'Можливості', href: '#features', destination: '/#features' },
  { label: 'Тарифи', href: '#pricing', destination: '/#pricing' },
  { label: 'FAQ', href: '#faq', destination: '/#faq' },
]
