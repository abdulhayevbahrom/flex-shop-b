import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, trim: true, default: "" },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    photoUrl: { type: String, trim: true, default: "" },
    languageCode: { type: String, trim: true, default: "uz" },
    balanceUzs: { type: Number, min: 0, default: 0 },
    isBlocked: { type: Boolean, default: false },
    hasStartedBot: { type: Boolean, default: false, index: true },
    botStartedAt: Date,
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform(_document, result) {
    result.id = result._id.toString();
    delete result._id;
    delete result.__v;
    return result;
  },
});

export const User = mongoose.model("User", userSchema);
