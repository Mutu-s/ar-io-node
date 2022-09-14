/**
 * AR.IO Gateway
 * Copyright (C) 2022 Permanent Data Solutions, Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import * as EventEmitter from 'events';
import { default as fastq } from 'fastq';
import type { queueAsPromised } from 'fastq';
import { default as wait } from 'wait';
import * as winston from 'winston';

import { ChainSource, PartialJsonTransaction } from '../types.js';

const DEFAULT_WORKER_COUNT = 1;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_WAIT_MS = 5000;

export class TransactionFetcher {
  // Dependencies
  private log: winston.Logger;
  private chainSource: ChainSource;
  private eventEmitter: EventEmitter;

  // Parameters
  private maxAttempts: number;
  private retryWaitMs: number;

  // TX fetch queue
  private txFetchQueue: queueAsPromised<string, void>;

  constructor({
    log,
    chainSource,
    eventEmitter,
    workerCount = DEFAULT_WORKER_COUNT,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryWaitMs = DEFAULT_RETRY_WAIT_MS,
  }: {
    log: winston.Logger;
    chainSource: ChainSource;
    eventEmitter: EventEmitter;
    workerCount?: number;
    maxAttempts?: number;
    retryWaitMs?: number;
  }) {
    this.log = log.child({ class: 'TransactionFetcher' });
    this.chainSource = chainSource;
    this.eventEmitter = eventEmitter;

    this.maxAttempts = maxAttempts;
    this.retryWaitMs = retryWaitMs;

    // Initialize TX ID fetch queue
    this.txFetchQueue = fastq.promise(this.fetchTx.bind(this), workerCount);
  }

  async queueTxId(txId: string): Promise<void> {
    this.log.info(`Queuing TX to fetch`, { txId });
    this.txFetchQueue.push(txId);
  }

  async fetchTx(txId: string): Promise<void> {
    const log = this.log.child({ txId });

    let attempts = 0;
    let tx: PartialJsonTransaction | undefined;
    while (attempts < this.maxAttempts && !tx) {
      try {
        log.info(`Fetching transaction`);
        tx = await this.chainSource.getTx(txId);
        this.eventEmitter.emit('tx-fetched', tx);
      } catch (error: any) {
        log.warn(`Failed to fetch transaction:`, {
          message: error.message,
        });
        await wait(this.retryWaitMs);
        attempts++;
      }
    }
  }
}