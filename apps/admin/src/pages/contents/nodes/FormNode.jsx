import { DecoratorNode } from 'lexical'
import FormComponent from './FormComponent.jsx'

export class FormNode extends DecoratorNode {
  __formId
  __slug
  __title

  constructor({ formId, slug, title } = {}, key) {
    super(key)
    this.__formId = String(formId || '').trim()
    this.__slug = String(slug || '').trim()
    this.__title = String(title || '').trim()
  }

  static getType() {
    return 'contexthub-form'
  }

  static clone(node) {
    return new FormNode(
      {
        formId: node.__formId,
        slug: node.__slug,
        title: node.__title,
      },
      node.__key
    )
  }

  static importJSON(serializedNode) {
    return $createFormNode(serializedNode)
  }

  exportJSON() {
    return {
      type: 'contexthub-form',
      version: 1,
      formId: this.__formId,
      slug: this.__slug,
      title: this.__title,
    }
  }

  static importDOM() {
    return {
      div: (domNode) => {
        if (!(domNode instanceof HTMLDivElement)) {
          return null
        }

        if (!domNode.hasAttribute('data-contexthub-form')) {
          return null
        }

        return {
          conversion: convertFormElement,
          priority: 3,
        }
      },
    }
  }

  exportDOM() {
    const element = document.createElement('div')
    element.className = 'contexthub-form-embed'
    element.setAttribute('data-contexthub-form', 'true')
    if (this.__formId) {
      element.setAttribute('data-form-id', this.__formId)
    }
    if (this.__slug) {
      element.setAttribute('data-form-slug', this.__slug)
    }
    if (this.__title) {
      element.setAttribute('data-form-title', this.__title)
    }
    element.textContent = this.__title || this.__slug || this.__formId || 'ContextHub Form'
    return { element }
  }

  createDOM() {
    const div = document.createElement('div')
    div.className = 'editor-form-wrapper'
    return div
  }

  updateDOM() {
    return false
  }

  decorate() {
    return (
      <FormComponent
        nodeKey={this.getKey()}
        formId={this.__formId}
        slug={this.__slug}
        title={this.__title}
      />
    )
  }

  setPayload(payload = {}) {
    const writable = this.getWritable()
    writable.__formId = String(payload.formId || '').trim()
    writable.__slug = String(payload.slug || '').trim()
    writable.__title = String(payload.title || '').trim()
  }
}

export function $createFormNode(payload) {
  return new FormNode(payload || {})
}

export function $isFormNode(node) {
  return node instanceof FormNode
}

function convertFormElement(domNode) {
  const formId = domNode.getAttribute('data-form-id') || ''
  const slug = domNode.getAttribute('data-form-slug') || ''
  const title = domNode.getAttribute('data-form-title') || domNode.textContent || ''

  if (!formId && !slug) {
    return null
  }

  return {
    node: $createFormNode({ formId, slug, title }),
  }
}
