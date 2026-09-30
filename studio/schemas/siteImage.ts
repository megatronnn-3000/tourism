import {defineType, defineField} from 'sanity'

export const siteImage = defineType({
  name: 'siteImage',
  title: 'Image',
  type: 'document',
  fields: [
    defineField({
      name: 'slot',
      title: 'Slot on the page',
      type: 'string',
      description: 'Technical name — do not change it, or the image disappears from the site.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      // hotspot lets the subject be marked once; every crop the site asks for
      // (square gallery tile, wide hero band) keeps that point centred.
      options: {hotspot: true},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'alt',
      title: 'Image description',
      type: 'localeString',
      description: 'For screen readers and Google. Leave empty to keep the existing description.',
    }),
  ],
  preview: {
    select: {title: 'slot', subtitle: 'alt.de', media: 'image'},
  },
})
