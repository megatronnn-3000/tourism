import type {StructureResolver} from 'sanity/structure'

// The sidebar shows only the three things anyone ever needs here: the page
// text, reviews waiting on a decision, and the photos.
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Page text')
        .id('siteContent')
        .child(S.document().schemaType('siteContent').documentId('siteContent').title('Page text')),

      S.divider(),

      S.listItem()
        .title('Reviews · New')
        .id('reviewsPending')
        .child(
          S.documentList()
            .title('New reviews')
            .filter('_type == "review" && status == "pending"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.listItem()
        .title('Reviews · Published')
        .id('reviewsApproved')
        .child(
          S.documentList()
            .title('Published reviews')
            .filter('_type == "review" && status == "approved"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.listItem()
        .title('Reviews · Rejected')
        .id('reviewsRejected')
        .child(
          S.documentList()
            .title('Rejected reviews')
            .filter('_type == "review" && status == "rejected"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.divider(),

      S.listItem().title('Images').id('siteImage').child(S.documentTypeList('siteImage').title('Images')),
    ])
