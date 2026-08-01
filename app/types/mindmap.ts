export interface CustomNode {
    id: string;
    content: string;
    children: CustomNode[];
    payload?: any;
    isGhost?: boolean;
}
