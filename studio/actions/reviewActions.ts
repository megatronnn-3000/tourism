import {useState} from 'react'
import {useDocumentOperation, type DocumentActionComponent, type DocumentActionProps} from 'sanity'

// Moderating should not mean finding a dropdown, setting it correctly and then
// remembering to publish. One button per outcome does both.

const statusOf = (props: DocumentActionProps) =>
  ((props.draft ?? props.published) as {status?: string} | null)?.status

const makeAction = (
  target: 'approved' | 'rejected',
  label: string,
  busyLabel: string,
  tone: 'positive' | 'critical',
): DocumentActionComponent => {
  const action: DocumentActionComponent = (props) => {
    const {patch, publish} = useDocumentOperation(props.id, props.type)
    const [busy, setBusy] = useState(false)

    if (statusOf(props) === target) return null

    return {
      label: busy ? busyLabel : label,
      tone,
      disabled: busy,
      onHandle: () => {
        setBusy(true)
        patch.execute([{set: {status: target}}])
        publish.execute()
        props.onComplete()
      },
    }
  }
  return action
}

export const approveReview = makeAction('approved', 'Publish', 'Publishing …', 'positive')
export const rejectReview = makeAction('rejected', 'Reject', 'Rejecting …', 'critical')
