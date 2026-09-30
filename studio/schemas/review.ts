import {defineType, defineField} from 'sanity'

export const review = defineType({
  name: 'review',
  title: 'Review',
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
      title: 'City',
      type: 'string',
      validation: (rule) => rule.max(80),
    }),
    defineField({
      name: 'rating',
      title: 'Stars',
      type: 'number',
      options: {list: [1, 2, 3, 4, 5], layout: 'radio', direction: 'horizontal'},
      validation: (rule) => rule.required().min(1).max(5).integer(),
    }),
    defineField({
      name: 'language',
      title: 'Submitted in',
      type: 'string',
      options: {
        list: [
          {title: 'German', value: 'de'},
          {title: 'English', value: 'en'},
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: 'quoteOriginal',
      title: 'Original text',
      type: 'text',
      rows: 6,
      // Kept verbatim and locked. If a review is ever disputed, this is the
      // record of what the guest actually wrote.
      readOnly: true,
      description: 'Exactly as submitted. Not editable.',
    }),
    defineField({
      name: 'quoteDe',
      title: 'Text · German',
      type: 'text',
      rows: 6,
      description: 'Shown on the German site.',
    }),
    defineField({
      name: 'quoteEn',
      title: 'Text · English',
      type: 'text',
      rows: 6,
      description: 'Shown on the English site.',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'New', value: 'pending'},
          {title: 'Published', value: 'approved'},
          {title: 'Rejected', value: 'rejected'},
        ],
        layout: 'radio',
      },
      initialValue: 'pending',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'submittedAt',
      title: 'Received',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  orderings: [
    {
      title: 'Newest first',
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
        title: `${flag}${author || 'No name'}${city ? `, ${city}` : ''}`,
        subtitle: `${stars}  ${(quote || '').slice(0, 90)}`,
      }
    },
  },
})
