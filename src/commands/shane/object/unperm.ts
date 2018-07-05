import { SfdxCommand, core } from '@salesforce/command';
import * as _ from 'lodash';
import fs = require('fs-extra');
import jsToXml = require('js2xmlparser');

import { getExisting } from '../../../shared/getExisting';
import { setupArray } from '../../../shared/setupArray';

import * as options from '../../../shared/js2xmlStandardOptions';

import chalk from 'chalk';

export default class UnPerm extends SfdxCommand {

  public static description = 'convert a profile into a permset';

  public static examples = [
`sfdx shane:object:unperm -o OpportunitySplit
// go through all the profiles/permsets in force-app/main/default and remove the object, field, recordtypes and layout assignments (profile only) for the named object
`
  ];

  protected static flagsConfig = {
    object: { type: 'string', char: 'o', required: true, description: 'remove all references to an object from profiles or permsets' },
    directory: { type: 'string', char: 'd', default: 'force-app/main/default', description: 'Where is all this metadata? defaults to force-app/main/default' },
    specific: { type: 'string', char: 's', description: 'specify a profile or permset by name to only remove it from that one' }
  };

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;

  public async run(): Promise<any> { // tslint:disable-line:no-any
    const profileDirectory = `${this.flags.directory}/profiles`;
    const permsetDirectory = `${this.flags.directory}/permissionsets`;

    // verify selected target's existence locally
    if (this.flags.specific && !fs.existsSync(`${profileDirectory}/${this.flags.specific}`) && !fs.existsSync(`${permsetDirectory}/${this.flags.specific}`)) {
      throw new Error(`not found: ${this.flags.specific}`);
    }

    const profiles = fs.readdirSync(profileDirectory);
    const permsets = fs.readdirSync(permsetDirectory);

    for (const p of profiles) {
      const targetFilename = `${profileDirectory}/${p}`;
      await this.removePerms(targetFilename, 'Profile');
    }

    for (const p of permsets) {
      const targetFilename = `${permsetDirectory}/${p}`;
      await this.removePerms(targetFilename, 'PermissionSet');
    }

  }

  public async removePerms(targetFilename: string, metadataType: string): Promise<any> { // tslint:disable-line:no-any
    // this.ux.log(chalk.blue(targetFilename));

    let existing = await getExisting(targetFilename, metadataType);

    existing = setupArray(existing, 'objectPermissions');
    existing = setupArray(existing, 'fieldPermissions');
    existing = setupArray(existing, 'layoutAssignments');
    existing = setupArray(existing, 'recordTypes');
    // this.ux.logJson(existing.objectPermissions);
    // this.ux.logJson(existing.fieldPermissions);

    const objectBefore = existing.objectPermissions.length;
    const fieldBefore = existing.fieldPermissions.length;
    const layoutBefore = existing.layoutAssignments.length;
    const recordTypeBefore = existing.recordTypeVisibilities.length;

    existing.objectPermissions = _.filter(existing.objectPermissions, (item) => item.object !== this.flags.object);
    existing.fieldPermissions = _.filter(existing.fieldPermissions, (item) => !item.field.startsWith(`${this.flags.object}.`));
    existing.layoutAssignments = _.filter(existing.layoutAssignments, (item) => !item.layout.startsWith(`${this.flags.object}-`));
    existing.recordTypeVisibilities = _.filter(existing.recordTypeVisibilities, (item) => !item.recordType.startsWith(`${this.flags.object}.`));

    if (existing['$']) {
      const temp = existing['$'];
      delete existing['$'];
      existing['@'] = temp;
    }

    const outputXML = jsToXml.parse(metadataType, existing, options.js2xmlStandardOptions);
    fs.writeFileSync(targetFilename, outputXML);
    this.ux.log(`removed ${objectBefore - existing.objectPermissions.length} object permissions, ${recordTypeBefore - existing.recordTypes.length} recordTypes, ${layoutBefore - existing.layoutAssignments.length} layouts assignments and ${fieldBefore - existing.fieldPermissions.length} field permissions from ${this.flags.object} in ${metadataType} ${chalk.blue(targetFilename)}`);

  }
}
