import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'outline' | 'ghost' | 'mono'
export type ButtonSize = 'sm' | 'md'

interface ButtonCommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

interface ButtonElementProps
  extends ButtonCommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  href?: undefined
  external?: never
}

interface ButtonLinkProps extends ButtonCommonProps {
  href: string
  external?: boolean
}

export type ButtonProps = ButtonElementProps | ButtonLinkProps

function buttonClassName({
  variant = 'outline',
  size = 'md',
  className,
}: Pick<ButtonCommonProps, 'variant' | 'size' | 'className'>) {
  return ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')
}

export function Button(props: ButtonProps) {
  const { variant, size, className, children, href, ...rest } = props
  const classes = buttonClassName({ variant, size, className })

  if (href) {
    const { external, ...anchorRest } = rest as Omit<ButtonLinkProps, keyof ButtonCommonProps | 'href'>

    if (external || href.startsWith('http')) {
      return (
        <a
          href={href}
          className={classes}
          target="_blank"
          rel="noopener noreferrer"
          {...anchorRest}
        >
          {children}
        </a>
      )
    }

    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    )
  }

  const { type = 'button', ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>

  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  )
}
