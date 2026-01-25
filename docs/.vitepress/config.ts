import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'oh-my-customcode',
  description: 'Batteries-included agent harness for Claude Code',

  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/agents' },
      {
        text: 'Links',
        items: [
          { text: 'GitHub', link: 'https://github.com/baekenough/oh-my-customcode' },
          { text: 'npm', link: 'https://www.npmjs.com/package/oh-my-customcode' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [{ text: 'Getting Started', link: '/guide/getting-started' }],
        },
        {
          text: 'Usage',
          items: [
            { text: 'CLI Commands', link: '/guide/commands' },
            { text: 'Customization', link: '/guide/customization' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Agents', link: '/reference/agents' },
            { text: 'Skills', link: '/reference/skills' },
            { text: 'Rules', link: '/reference/rules' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/baekenough/oh-my-customcode' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present baekenough',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/baekenough/oh-my-customcode/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
