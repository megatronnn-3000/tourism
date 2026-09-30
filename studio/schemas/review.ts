import {defineType, defineField} from 'sanity'

export const review = defineType({
  name: 'review',
  title: 'Bewertung',
  type: 'document',
  fields: [
    defineField({
      name: 'author',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required().max(80),
    }),
    defineField({
      name: 'city',
      title: 'Stadt',
      type: 'string',
      validation: (rule) => rule.max(80),
    }),
    defineField({
      name: 'rating',
      title: 'Sterne',
      type: 'number',
      options: {list: [1, 2, 3, 4, 5], layout: 'radio', direction: 'horizontal'},
      validation: (rule) => rule.required().min(1).max(5).integer(),
    }),
    defineField({
      name: 'language',
      title: 'Eingereicht auf',
      type: 'string',
      options: {
        list: [
          {title: 'Deutsch', value: 'de'},
          {title: 'English', value: 'en'},
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: 'quoteOriginal',
      title: 'Originaltext',
      type: 'text',
      rows: 6,
      // Kept verbatim and locked. If a review is ever disputed, this is the
      // record of what the guest actually wrote.
      readOnly: true,
      description: 'Genau so eingereicht. Nicht bearbeitbar.',
    }),
    defineField({
      name: 'quoteDe',
      title: 'Text · Deutsch',
      type: 'text',
      rows: 6,
      description: 'Wird auf der deutschen Seite angezeigt.',
    }),
    defineField({
      name: 'quoteEn',
      title: 'Text · English',
      type: 'text',
      rows: 6,
      description: 'Wird auf der englischen Seite angezeigt.',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Neu eingegangen', value: 'pending'},
          {title: 'Veröffentlichen', value: 'approved'},
          {title: 'Abgelehnt', value: 'rejected'},
        ],
        layout: 'radio',
      },
      initialValue: 'pending',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'submittedAt',
      title: 'Eingegangen am',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  orderings: [
    {
      title: 'Neueste zuerst',
      name: 'submittedAtDesc',
      by: [{field: 'submittedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {author: 'author', city: 'city', rating: 'rating', status: 'status', quote: 'quoteOriginal'},
    prepare({author, city, rating, status, quote}) {
      const stars = '★'.repeat(rating || 0)
      const flag = status === 'pending' ? '• ' : ''
      return {
        title: `${flag}${author || 'Ohne Namen'}${city ? `, ${city}` : ''}`,
        subtitle: `${stars}  ${(quote || '').slice(0, 90)}`,
      }
    },
  },
})
