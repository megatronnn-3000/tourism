import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // Where `sanity deploy` publishes the Studio: govind-reiseleiter.sanity.studio.
  // Kept here rather than passed on the command line so every deploy lands on
  // the same URL, which is the one Govind has bookmarked.
  studioHost: 'govind-reiseleiter',
  deployment: {
    appId: 'tnf6iaassyhx9rlox49fi9h6',
  },
})
