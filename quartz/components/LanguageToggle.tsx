// @ts-ignore
import languageToggleScript from "./scripts/languageToggle.inline"
import styles from "./styles/languageToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const LanguageToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  const title = "Toggle language"

  return (
    <a
      class={classNames(displayClass, "language-toggle")}
      href="?hl=ko"
      aria-label={title}
      data-label-en="English"
      data-label-ko="한국어"
    >
      한국어
    </a>
  )
}

LanguageToggle.afterDOMLoaded = languageToggleScript
LanguageToggle.css = styles

export default (() => LanguageToggle) satisfies QuartzComponentConstructor
