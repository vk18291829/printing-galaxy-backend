import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** `bulk`: class lists, photo ZIPs and generated print sheets for institution bulk jobs. */
export const FILE_PURPOSES = ['order', 'proof', 'logo', 'catalog', 'bulk'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

const ownerSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['user', 'institution'], required: true },
  },
  { _id: false },
);

const fileSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    bucket: { type: String, enum: ['private', 'public'], default: 'private' },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    pageCount: Number,
    purpose: { type: String, enum: FILE_PURPOSES, required: true },
    owner: { type: ownerSchema, required: true },
    status: { type: String, enum: ['pending', 'uploaded', 'deleted'], default: 'pending' },
    sensitive: { type: Boolean, default: false },
    order: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    /** Set for sensitive files once the order is completed. */
    deleteAfter: { type: Date, index: true },
    publicUrl: String,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

fileSchema.index({ 'owner.id': 1, createdAt: -1 });

export type FileObject = InferSchemaType<typeof fileSchema>;
export type FileObjectDoc = HydratedDocument<FileObject>;
export const FileModel = model('FileObject', fileSchema);
