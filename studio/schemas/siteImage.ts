import {defineType, defineField} from 'sanity'

export const siteImage = defineType({
  name: 'siteImage',
  title: 'Bild',
  type: 'document',
  fields: [
    defineField({
      name: 'slot',
      title: 'Platz auf der Seite',
      type: 'string',
      description: 'Technischer Name — bitte nicht ändern, sonst verschwindet das Bild von der Seite.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Bild',
      type: 'image',
      // hotspot lets Govind mark the subject once; every crop the site asks for
      // (square gallery tile, wide hero band) keeps that point centred.
      options: {hotspot: true},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'alt',
      title: 'Bildbeschreibung',
      type: 'localeString',
      description: 'Für Screenreader und Google. Leer lassen, um die bestehende Beschreibung zu behalten.',
    }),
  ],
  preview: {
    select: {title: 'slot', subtitle: 'alt.de', media: 'image'},
  },
})
