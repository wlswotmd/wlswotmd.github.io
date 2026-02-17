import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const ArticleTitle: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const title = fileData.frontmatter?.title
  const titleKo = fileData.frontmatter?.title_ko
  if (title) {
    if (titleKo) {
      return (
        <h1 class={classNames(displayClass, "article-title")}>
          <span class="lang-title" data-lang="en">
            {title}
          </span>
          <span class="lang-title" data-lang="ko">
            {titleKo}
          </span>
        </h1>
      )
    }
    return <h1 class={classNames(displayClass, "article-title")}>{title}</h1>
  } else {
    return null
  }
}

ArticleTitle.css = `
.article-title {
  margin: 2rem 0 0 0;
}
`

export default (() => ArticleTitle) satisfies QuartzComponentConstructor
