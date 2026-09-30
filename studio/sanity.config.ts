import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemas'
import {structure} from './structure'
import {approveReview, rejectReview} from './actions/reviewActions'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || ''
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

if (!projectId) {
  // A warning, not a throw: `sanity login` and `sanity projects create` are run
  // from this folder before a project ID exists, and throwing here would break
  // them. Sanity's own validation reports the missing ID on dev/build/deploy.
  console.warn('SANITY_STUDIO_PROJECT_ID is not set — copy .env.example to .env and fill it in.')
}

export default defineConfig({
  name: 'default',
  title: 'Govind · Reiseleiter Indien',
  projectId,
  dataset,
  plugins: [structureTool({structure}), visionTool()],
  schema: {
    types: schemaTypes,
    // siteContent is a singleton: exactly one document, created by the migration
    // script. Hide it from the global "create new" menu so nobody makes a second.
    templates: (prev) => prev.filter((t) => t.schemaType !== 'siteContent'),
  },
  document: {
    actions: (prev, {schemaType}) => {
      if (schemaType === 'siteContent') {
        return prev.filter(({action}) => action !== 'unpublish' && action !== 'delete' && action !== 'duplicate')
      }
      if (schemaType === 'review') {
        return [approveReview, rejectReview, ...prev]
      }
      return prev
    },
  },
})
