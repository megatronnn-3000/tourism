import type {StructureResolver} from 'sanity/structure'

// Govind is the person who uses this Studio, so the sidebar is in German and
// shows only the three things he ever needs: the page text, new reviews waiting
// on him, and the photos.
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Inhalt')
    .items([
      S.listItem()
        .title('Seitentexte')
        .id('siteContent')
        .child(S.document().schemaType('siteContent').documentId('siteContent').title('Seitentexte')),

      S.divider(),

      S.listItem()
        .title('Bewertungen · Neu eingegangen')
        .id('reviewsPending')
        .child(
          S.documentList()
            .title('Neu eingegangen')
            .filter('_type == "review" && status == "pending"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.listItem()
        .title('Bewertungen · Veröffentlicht')
        .id('reviewsApproved')
        .child(
          S.documentList()
            .title('Veröffentlicht')
            .filter('_type == "review" && status == "approved"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.listItem()
        .title('Bewertungen · Abgelehnt')
        .id('reviewsRejected')
        .child(
          S.documentList()
            .title('Abgelehnt')
            .filter('_type == "review" && status == "rejected"')
            .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
            .apiVersion('2024-10-01'),
        ),

      S.divider(),

      S.listItem().title('Bilder').id('siteImage').child(S.documentTypeList('siteImage').title('Bilder')),
    ])
