import { Fragment, Children, cloneElement, createElement, isValidElement, useId, useState, type ReactNode, type ReactElement, type HTMLAttributes, type FormEventHandler } from 'react';

type Props = Omit<HTMLAttributes<HTMLElement>, 'title' | 'onSubmit'> & {
  as?: 'div' | 'section' | 'form'; title?: ReactNode; heading?: ReactNode;
  defaultExpanded?: boolean; onSubmit?: FormEventHandler<HTMLFormElement>;
};

// Keep the original heading in its original position for print layout. On screen
// it is represented by the toggle heading. Form controls remain mounted when closed.
function panelHeading(children: ReactNode) {
  let heading: ReactNode = null;
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, node => {
    if (!isValidElement(node) || (typeof node.type !== 'string' && node.type !== Fragment)) return node;
    const element = node as ReactElement<{ children?: ReactNode; className?: string }>;
    if (!heading && (node.type === 'h2' || node.type === 'h3')) {
      heading = node;
      return cloneElement(element, { className: `${element.props.className || ''} panel-original-heading` });
    }
    if (!heading && element.props.children) return cloneElement(element, { children: visit(element.props.children) });
    return element;
  });
  const body = visit(children);
  return { heading, body };
}

export function CollapsiblePanel({ as = 'div', title = 'Section', heading: suppliedHeading, defaultExpanded = true, className = '', children, ...props }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  const content = suppliedHeading ? { heading: suppliedHeading, body: children } : panelHeading(children);
  const layout = className.split(/\s+/).filter(name => ['panel-stack','count-settings','settings-panel','toolbar','inline-form','stack-form'].includes(name)).join(' ');
  return createElement(as, { ...props, className: `${className} collapsible-panel` },
    <div className="panel-toggle-row">
      <button type="button" className="panel-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
        <svg className="section-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
        <span className="panel-toggle-heading">{content.heading || <h2>{title}</h2>}</span>
      </button>
    </div>,
    <div id={id} className={`panel-body ${layout}`} hidden={!expanded}>{content.body}</div>
  );
}
