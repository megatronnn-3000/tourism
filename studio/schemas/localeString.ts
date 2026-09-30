import {defineType, defineField} from 'sanity'

export const localeString = defineType({
  name: 'localeString',
  title: 'Text (short)',
  type: 'object',
  options: {columns: 2},
  fields: [
    defineField({name: 'de', title: 'German', type: 'string'}),
    defineField({name: 'en', title: 'English', type: 'string'}),
  ],
})
