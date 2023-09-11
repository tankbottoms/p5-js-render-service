// These types are directly copied from juice-interface-svelte, probably would like to put them in their own package
export enum NftType {
    IMAGE = "Image",
    MUSIC = "Music",
    VIDEO = "Video",
    P5JS = "p5.js",
    PFP = "PFP",
  }
  
  export enum BlockchainType {
    ETHEREUM = "ethereum",
    TEZOS = "tezos",
  }
  
  export enum NftStatus {
    UNFINISHED,
    SAVED,
  }
  
  export type PinataPinResponse = {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
  };
  
  export interface DropzoneOutput {
    preview: string;
    pinInfo: PinataPinResponse;
  }
  
  export enum PfpConstraintType {
    NONE,
    COUNT,
    PERCENTAGE,
  }
  
  export interface PfpProperty {
    _id?: string;
    name: string;
    fileName: string;
    file: DropzoneOutput;
    constraint: {
      type: PfpConstraintType;
      value: number;
    };
  }
  
  export interface PfpAttribute {
    _id?: string;
    _status?: NftStatus;
    name: string;
    properties: PfpProperty[];
  }
  
  export interface NftConfig {
    _id: string;
    _type: NftType;
    _status?: NftStatus;
    _token: string;
    name: string;
    description: string;
    externalLink: string;
    totalSupply: number;
    blockchain: BlockchainType;
    defaultColor: string;
    // /* attribute */s?: Attributes;
    unlockableContent: boolean;
    sensitiveContent: boolean;
    freezeMetadata: boolean;
    ipfsMetadata?: PinataPinResponse;
  }
  
  export interface PfpNftConfig extends NftConfig {
    defaultColors: string[];
    layers: PfpAttribute[];
    seed?: string;
    ipfs?: PinataPinResponse;
  }
  
  export type Collection = {
    id: string;
    firebaseId?: string;
    network: string;
    // type?: CollectionType;
    // standard?: TokenStandard;
  
    banner: string;
    defaultImage?: string;
    logo?: string;
  
    creator: string;
    description: string;
    name: string;
    symbol: string;
    mintStart: number;
    mintEnd: number;
    airdrops?: string;
    // contracts?: Contracts;
    ipfsMetadata?: PinataPinResponse;
    // royalty?: Royalty;
  };
  
  export interface PfpCollection extends AdvancedCollection {
    nfts: PfpNftConfig[];
  }
  
  export type AdvancedCollection = Collection & {
    category?: string;
    defaultColors?: string[];
    links: string[];
    nftType?: NftType;
    nfts?: NftConfig[];
    // pricing?: CollectionPricing;
    randomize?: boolean;
    // reveal?: Reveal;
  };
  
  export enum PinningStates {
    QUEUED = "queued",
    PENDING = "pending",
    DONE = "done",
    FAILED = "failed",
  }
  