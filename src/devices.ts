

export interface Device {
    type: string;
    displayName: string;
}

export interface Subscription {
    (input: string): void
}
