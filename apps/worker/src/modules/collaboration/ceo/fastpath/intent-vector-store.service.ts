import { Injectable } from '@nestjs/common';

export interface IntentCandidate {
  id: 'greeting' | 'smalltalk' | 'status_check' | 'thanks' | 'farewell';
  description?: string;
  prototypes: string[];
}

export interface IntentSearchHit {
  intent: IntentCandidate;
  score: number;
}

@Injectable()
export class IntentVectorStoreService {
  private version = 1;

  private readonly intents: IntentCandidate[] = [
    {
      id: 'greeting',
      description: '用户进行简单问候或确认在线，不包含具体任务请求',
      prototypes: ['你好CEO', '在吗CEO', 'hello ceo', 'hi ceo', '您好'],
    },
    {
      id: 'smalltalk',
      description: '用户寒暄，不包含可执行目标',
      prototypes: ['最近怎么样', '忙吗', '辛苦了', '还在吗', '你在干嘛'],
    },
    {
      id: 'status_check',
      description: '用户进行在线/可用性确认',
      prototypes: ['收到吗', '在线吗', '能听到吗', '准备好了吗', '可以开始吗'],
    },
    {
      id: 'thanks',
      description: '用户表达感谢',
      prototypes: ['谢谢', '感谢', '辛苦', 'thx', 'thanks'],
    },
    {
      id: 'farewell',
      description: '用户结束对话或暂时离开',
      prototypes: ['再见', '晚安', '回头聊', '先这样', 'bye'],
    },
  ];

  getVersion(): number {
    return this.version;
  }

  bumpVersion(): number {
    this.version += 1;
    return this.version;
  }

  private embed(text: string): number[] {
    const v = new Array<number>(64).fill(0);
    const normalized = text.toLowerCase().trim();
    for (let i = 0; i < normalized.length; i += 1) {
      const c = normalized.charCodeAt(i);
      v[c % 64] += 1;
      if (i + 1 < normalized.length) {
        const bi = (c * 131 + normalized.charCodeAt(i + 1)) % 64;
        v[bi] += 0.8;
      }
    }
    return v;
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i]! * b[i]!;
      na += a[i]! * a[i]!;
      nb += b[i]! * b[i]!;
    }
    if (na <= 0 || nb <= 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  search(message: string, topK = 5): IntentSearchHit[] {
    const q = this.embed(message);
    const hits = this.intents.map((intent) => {
      const max = intent.prototypes.reduce((acc, p) => {
        const score = this.cosine(q, this.embed(p));
        return Math.max(acc, score);
      }, 0);
      return { intent, score: max };
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, topK));
  }
}

