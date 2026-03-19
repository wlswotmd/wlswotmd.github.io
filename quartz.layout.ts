import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

const mobileExplorerTools = (includeReaderMode: boolean) => [
  Component.LanguageToggle(),
  Component.Darkmode(),
  ...(includeReaderMode ? [Component.ReaderMode()] : []),
]

const sidebarControls = (includeReaderMode: boolean) =>
  Component.Flex({
    components: [
      {
        Component: Component.Search(),
        grow: true,
      },
      {
        Component: Component.DesktopOnly(
          Component.Flex({
            components: [
              { Component: Component.LanguageToggle() },
              { Component: Component.Darkmode() },
              ...(includeReaderMode ? [{ Component: Component.ReaderMode() }] : []),
            ],
            gap: "0.75rem",
          }),
        ),
      },
    ],
    gap: "0.75rem",
  })

const leftSidebar = (includeReaderMode: boolean) => [
  Component.PageTitle(),
  sidebarControls(includeReaderMode),
  Component.Explorer({
    mobileTools: mobileExplorerTools(includeReaderMode),
  }),
]

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.Comments({
      provider: "giscus",
      options: {
        repo: "wlswotmd/wlswotmd.github.io",
        repoId: "R_kgDORJKJjQ",
        category: "Comments",
        categoryId: "DIC_kwDORJKJjc4C2pJG",
        mapping: "pathname",
        strict: true,
        reactionsEnabled: true,
        inputPosition: "top",
        lang: "en",
        lightTheme: "light",
        darkTheme: "dark",
      },
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/jackyzha0/quartz",
      "Discord Community": "https://discord.gg/cRFFHYye7t",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.TagList(),
  ],
  left: leftSidebar(true),
  right: [
    Component.DesktopOnly(Component.TableOfContents()),
    Component.RecentNotes({
      limit: 5,
      showTags: false,
      filter: (f) => f.frontmatter?.["llm-generated"] !== true,
    }),
    Component.Backlinks({ hideWhenEmpty: false }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: leftSidebar(false),
  right: [],
}
