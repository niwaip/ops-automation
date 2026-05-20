import { Project, SyntaxKind, Node, JsxElement, JsxFragment } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/components/WorkflowEditModal.tsx');

const componentFunc = sourceFile.getVariableDeclaration('WorkflowEditModal')?.getInitializerIfKind(SyntaxKind.ArrowFunction) || sourceFile.getFunction('WorkflowEditModal');
const body = componentFunc?.getBody();

if (body && Node.isBlock(body)) {
    const returnStatements = body.getStatements().filter(Node.isReturnStatement);
    if (returnStatements.length > 0) {
        const lastReturn = returnStatements[returnStatements.length - 1];
        const expr = lastReturn.getExpression();
        
        if (expr && (Node.isJsxElement(expr) || Node.isParenthesizedExpression(expr))) {
            let jsxElement = Node.isParenthesizedExpression(expr) ? expr.getExpression() : expr;
            
            if (Node.isJsxElement(jsxElement)) {
                // Find all children that are Modals or Drawers
                const childrenToKeep = jsxElement.getJsxChildren().filter(child => {
                    if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
                        const tagName = Node.isJsxElement(child) ? child.getOpeningElement().getTagNameNode().getText() : child.getTagNameNode().getText();
                        return tagName === 'Modal' || tagName === 'Drawer';
                    }
                    return false;
                });
                
                // Construct a new JSX Fragment containing only the Modals and Drawers
                const newJsx = '<>\\n' + childrenToKeep.map(c => c.getFullText()).join('\\n') + '\\n</>';
                
                // Replace the original JSX element with the new Fragment
                jsxElement.replaceWithText(newJsx);
            }
        }
    }
}

sourceFile.saveSync();
console.log('Refactoring step 3 completed.');
