import {defineType, defineField} from 'sanity'

export const localeText = defineType({
  name: 'localeText',
  title: 'Text (lang)',
  type: 'object',
  fields: [
    defineField({name: 'de', title: 'Deutsch', type: 'text', rows: 4}),
    defineField({name: 'en', title: 'English', type: 'text', rows: 4}),
  ],
})
