'use client'

import { graphql } from 'src/packages/omnivore/gql'
import { useMutation, useQuery } from 'urql'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import { Pager } from 'src/packages/pager'
import clsx from 'clsx'
import { useGlobalConfig } from 'src/packages/useSettings'
import { PageNav } from './PageNav'
import { formatDistanceToNow } from 'date-fns'
import { useParseHTML } from 'src/packages/blocks'
// import { TableOfContent } from 'src/packages/blocks/TOC'
import { useCallback, useEffect, useMemo } from 'react'
import debug from 'debug'

const log = debug('route/read')

const ArticleQuery = graphql(/* GraphQL */ `
  query Article($username: String!, $slug: String!, $format: String!) {
    article(username: $username, slug: $slug, format: $format) {
      ... on ArticleSuccess {
        article {
          id
          title
          content
          savedAt
          url
          siteName
          publishedAt
          savedAt
          author
          readingProgressPercent
        }
      }
    }
  }
`)

const SaveArticleReadingProgress = graphql(/* GraphQL */ `
  mutation SaveArticleReadingProgress($input: SaveArticleReadingProgressInput!) {
    saveArticleReadingProgress(input: $input) {
      ... on SaveArticleReadingProgressSuccess {
        updatedArticle {
          id
          readingProgressPercent
          readingProgressAnchorIndex
        }
      }
      ... on SaveArticleReadingProgressError {
        errorCodes
      }
    }
  }
`)

const CreateHighlight = graphql(/* GraphQL */ `
  mutation CreateHighlight($input: CreateHighlightInput!) {
    createHighlight(input: $input) {
      ... on CreateHighlightSuccess {
        highlight {
          ...HighlightFields
        }
      }
      ... on CreateHighlightError {
        errorCodes
      }
    }
  }
  fragment HighlightFields on Highlight {
    id
    type
    shortId
    quote
    prefix
    suffix
    patch
    color
    annotation
    createdByMe
    createdAt
    updatedAt
    sharedAt
    highlightPositionPercent
    highlightPositionAnchorIndex
    labels {
      id
      name
      color
      createdAt
    }
  }
`)

const useSaveArticleReadingProgress = (id: string | null) => {
  const [handle, executeMutation] = useMutation(SaveArticleReadingProgress)

  const handlePageChange = useCallback(
    (page: number, totalPage: number) => {
      if (id) {
        log('handlePageChange', {
          page,
          totalPage,
        })

        executeMutation({
          input: {
            id: id,
            readingProgressPercent: (page + 1) / totalPage,
          },
        })
      }
    },
    [id, executeMutation]
  )

  return handlePageChange
}

export default function Page({ params }: { params: { slug: string; username: string } }) {
  const [{ data, fetching }] = useQuery({
    query: ArticleQuery,
    variables: {
      slug: params.slug,
      username: params.username,
      // https://github.com/omnivore-app/omnivore/blob/main/packages/api/src/resolvers/article/index.ts#L106
      // markdown, html, distiller, highlightedMarkdown
      format: 'html',
    },
    requestPolicy: 'cache-first',
  })

  // parse the html into react component and apply custom elements and logic
  const [contentElement, toc] = useParseHTML(
    data?.article.__typename === 'ArticleSuccess' ? data.article.article.content : undefined
  )

  const [config] = useGlobalConfig()

  const id = useMemo(() => {
    return data?.article.__typename === 'ArticleSuccess' ? data.article.article.id : null
  }, [data])

  const handlePageChange = useSaveArticleReadingProgress(id)

  const [, createHighlightMutation] = useMutation(CreateHighlight)

  if (data?.article.__typename === 'ArticleSuccess') {
    const { title, url, siteName, savedAt, author, id, readingProgressPercent } = data.article.article

    return (
      <Pager
        menu={<PageNav linkId={id} slug={params.slug} username={params.username} />}
        initialReadingProgressPercent={readingProgressPercent}
        onPageChange={handlePageChange}
        padding={config.padding || 'p-2'}
        columnsPerPage={config.columns || 1}
      >
        <div className="prose">
          <h1 className="font-sans">{title}</h1>
          <p>
            {formatDistanceToNow(new Date(savedAt))} ago • {author && `${author} • `}
            <a href={url} target="_blank">
              {siteName}
            </a>
          </p>
        </div>

        <article
          onDoubleClick={(e) => {
            const target = e.target as HTMLElement

            const elem = target.closest(
              '[data-omnivore-anchor-idx], p, code, pre, ul, ol, h1, h2, h3, h4, h5, h6'
            ) as HTMLElement

            if (!elem) return

            elem.style.setProperty('background-color', 'rgb(229 231 235)', 'important')
            elem.style.setProperty('cursor', 'pointer', 'important')

            document.addEventListener(
              'click',
              async (e) => {
                try {
                  if (!elem.contains(e.target as HTMLElement)) return

                  await createHighlightMutation({
                    input: {
                      id: uuidv4(),
                      shortId: nanoid(8),
                      type: 'HIGHLIGHT' as any,
                      color: 'yellow',
                      prefix: '',
                      suffix: ' ',
                      quote: elem.textContent,
                      // html: str,
                      articleId: id,
                    },
                  })
                } catch (err) {
                  console.log(err)
                } finally {
                  elem.style?.removeProperty('background-color')
                  elem.style?.removeProperty('cursor')
                }
              },
              { once: true }
            )
          }}
          className={clsx(
            'prose prose-gray max-w-none',
            // font size
            {
              'prose-sm': config.fontSize === 0,
              'prose-base': config.fontSize === 1,
              'prose-lg': config.fontSize === 2,
              'prose-xl': config.fontSize === 3,
              'prose-2xl': config.fontSize === 4,
            },

            // e-ink style for `code` and `pre` block
            'prose-code:font-mono',
            'prose-pre:inline prose-pre:p-0 prose-pre:bg-transparent prose-pre:text-black',
            // 'prose-pre:bg-gray-200 prose-pre:text-black',

            // underline style
            'prose-a:underline-offset-4 prose-a:decoration-1 prose-a:decoration-dotted',

            // image
            'prose-img:mx-auto',

            // prevent table to be overflow on smaller size screens|columns
            'prose-table:table-fixed prose-table:break-all',

            // font family
            config.fontFamily,

            // line height
            config.leading,

            {
              'text-justify': config.justify,
            },
            // enable user select
            'select-text'
          )}
        >
          {contentElement}
        </article>
      </Pager>
    )
  }

  return null
}
