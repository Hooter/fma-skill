import { defineConfig } from 'vitepress';

const refs = [
  { text: 'Angular', link: '/references/angular' },
  { text: 'NestJS', link: '/references/nestjs' },
  { text: 'Contracts and events', link: '/references/contracts' },
  { text: 'Transports', link: '/references/transport' },
  { text: 'Enforcement', link: '/references/enforcement' },
  { text: 'Migration from FDA', link: '/references/migration' },
];

const refsRu = [
  { text: 'Angular (en)', link: '/references/angular' },
  { text: 'NestJS (en)', link: '/references/nestjs' },
  { text: 'Контракты и события (en)', link: '/references/contracts' },
  { text: 'Транспорты (en)', link: '/references/transport' },
  { text: 'Проверка правил (en)', link: '/references/enforcement' },
  { text: 'Переход с FDA (en)', link: '/references/migration' },
];

export default defineConfig({
  base: '/fma-skill/',
  title: 'FMA',
  cleanUrls: true,
  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/Hooter/fma-skill' }],
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'Fractal Module Architecture: an agent skill for Angular and NestJS',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide' },
          { text: 'Theory', link: '/theory' },
        ],
        sidebar: [
          { text: 'Guide', link: '/guide' },
          { text: 'Theory', link: '/theory' },
          { text: 'References', items: refs },
        ],
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      link: '/ru/',
      description: 'Fractal Module Architecture: skill для агентов, работающих с Angular и NestJS',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/guide' },
          { text: 'Теория', link: '/ru/theory' },
        ],
        sidebar: [
          { text: 'Руководство', link: '/ru/guide' },
          { text: 'Теория', link: '/ru/theory' },
          { text: 'Справочники (на английском)', items: refsRu },
        ],
        outlineTitle: 'На странице',
        docFooter: { prev: 'Назад', next: 'Далее' },
        darkModeSwitchLabel: 'Тема',
        sidebarMenuLabel: 'Меню',
        returnToTopLabel: 'Наверх',
        langMenuLabel: 'Язык',
      },
    },
  },
});
