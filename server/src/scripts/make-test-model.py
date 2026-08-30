"""
يبني نموذج GGUF صغير جدًا بأوزان عشوائية لاختبار مسار محرك احسمها كاملًا
(تحميل، ترميز، توليد، ستريمنق) بدون الحاجة لتحميل أوزان حقيقية.

مخرجاته كلام بلا معنى — الغرض منه اختبار السباكة فقط، مو الجودة.
التشغيل: python3 server/src/scripts/make-test-model.py .models/ahsmaha-test.gguf
"""
import sys
from pathlib import Path

import numpy as np
from gguf import GGUFWriter

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".models/ahsmaha-test.gguf")
OUT.parent.mkdir(parents=True, exist_ok=True)

# معمارية صغيرة جدًا حتى يبقى الملف بحدود ميغابايتات
N_VOCAB = 512
N_EMBD = 64
N_LAYER = 2
N_HEAD = 4
N_HEAD_KV = 4
N_FF = 128
HEAD_DIM = N_EMBD // N_HEAD
CTX = 2048

rng = np.random.default_rng(7)


def w(*shape):
    """أوزان عشوائية صغيرة بصيغة float32."""
    return (rng.standard_normal(shape) * 0.02).astype(np.float32)


writer = GGUFWriter(str(OUT), "llama")

writer.add_name("ahsmaha-test")
writer.add_context_length(CTX)
writer.add_embedding_length(N_EMBD)
writer.add_block_count(N_LAYER)
writer.add_feed_forward_length(N_FF)
writer.add_head_count(N_HEAD)
writer.add_head_count_kv(N_HEAD_KV)
writer.add_rope_dimension_count(HEAD_DIM)
writer.add_layer_norm_rms_eps(1e-5)
writer.add_file_type(0)  # F32

# مفردات بسيطة: رموز خاصة + بايتات + كلمات عربية شائعة
tokens = ["<unk>", "<s>", "</s>"]
scores = [0.0, 0.0, 0.0]
toktypes = [2, 3, 3]

for b in range(256):
    tokens.append(f"<0x{b:02X}>")
    scores.append(0.0)
    toktypes.append(6)

words = [
    "▁", "▁هلا", "▁والله", "▁ابشر", "▁طيب", "▁زين", "▁وش", "▁كيف", "▁وين",
    "▁احسمها", "▁تمام", "▁اكيد", "▁خلاص", "▁يالغالي", "▁الحين", "▁عشان",
    "ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص",
    "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي", "ة",
]
for word in words:
    tokens.append(word)
    scores.append(-1.0)
    toktypes.append(1)

while len(tokens) < N_VOCAB:
    idx = len(tokens)
    tokens.append(f"▁t{idx}")
    scores.append(-10.0)
    toktypes.append(1)

tokens = tokens[:N_VOCAB]
scores = scores[:N_VOCAB]
toktypes = toktypes[:N_VOCAB]

writer.add_tokenizer_model("llama")
writer.add_token_list(tokens)
writer.add_token_scores(scores)
writer.add_token_types(toktypes)
writer.add_bos_token_id(1)
writer.add_eos_token_id(2)
writer.add_unk_token_id(0)
writer.add_add_bos_token(True)
writer.add_add_eos_token(False)

writer.add_tensor("token_embd.weight", w(N_VOCAB, N_EMBD))
writer.add_tensor("output_norm.weight", np.ones(N_EMBD, dtype=np.float32))
writer.add_tensor("output.weight", w(N_VOCAB, N_EMBD))

for i in range(N_LAYER):
    p = f"blk.{i}"
    writer.add_tensor(f"{p}.attn_norm.weight", np.ones(N_EMBD, dtype=np.float32))
    writer.add_tensor(f"{p}.attn_q.weight", w(N_EMBD, N_EMBD))
    writer.add_tensor(f"{p}.attn_k.weight", w(N_HEAD_KV * HEAD_DIM, N_EMBD))
    writer.add_tensor(f"{p}.attn_v.weight", w(N_HEAD_KV * HEAD_DIM, N_EMBD))
    writer.add_tensor(f"{p}.attn_output.weight", w(N_EMBD, N_EMBD))
    writer.add_tensor(f"{p}.ffn_norm.weight", np.ones(N_EMBD, dtype=np.float32))
    writer.add_tensor(f"{p}.ffn_gate.weight", w(N_FF, N_EMBD))
    writer.add_tensor(f"{p}.ffn_up.weight", w(N_FF, N_EMBD))
    writer.add_tensor(f"{p}.ffn_down.weight", w(N_EMBD, N_FF))

writer.write_header_to_file()
writer.write_kv_data_to_file()
writer.write_tensors_to_file()
writer.close()

size_mb = OUT.stat().st_size / 1e6
print(f"جاهز: {OUT} ({size_mb:.1f} ميغابايت)")
